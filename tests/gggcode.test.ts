import { describe, expect, it } from 'vitest';
import { decodeGggCode, encodeGggCode, extractCodeFromUrl, fromBase64Url } from '../src/logic/gggcode';
import { deserializeBuild, serializeBuild, type BuildSnapshot } from '../src/logic/urlstate';
import { loadPassive } from './helpers';

describe('GGG code v6', () => {
  it('round-trips decode(encode(x)) == x', () => {
    const build = {
      classId: 3,
      ascendancyId: 2,
      nodes: [1234, 555, 60000, 42],
      clusterNodes: [65540, 66000],
      masteries: new Map([
        [1234, 29161],
        [555, 47823],
      ]),
    };
    const code = encodeGggCode(build);
    const decoded = decodeGggCode(code);
    expect(decoded.version).toBe(6);
    expect(decoded.classId).toBe(3);
    expect(decoded.ascendancyId).toBe(2);
    expect(decoded.nodes).toEqual([42, 555, 1234, 60000]);
    expect(decoded.clusterNodes).toEqual([65540, 66000]);
    expect(decoded.masteries).toEqual(build.masteries);
  });

  it('produces the exact expected byte layout', () => {
    const code = encodeGggCode({
      classId: 1,
      ascendancyId: 2,
      nodes: [0x0102],
      clusterNodes: [65536 + 5],
      masteries: new Map([[0x0304, 0x0506]]),
    });
    const bytes = [...fromBase64Url(code)];
    expect(bytes).toEqual([
      0, 0, 0, 6, // version
      1, 2, // class, ascendancy
      1, 0x01, 0x02, // node count + node
      1, 0x00, 0x05, // cluster count + cluster (id - 65536)
      1, 0x05, 0x06, 0x03, 0x04, // mastery count + (effectId, nodeId)
    ]);
  });

  it('round-trips an empty build', () => {
    const code = encodeGggCode({ classId: 0, ascendancyId: 0, nodes: [], masteries: new Map() });
    const d = decodeGggCode(code);
    expect(d.nodes).toEqual([]);
    expect(d.masteries.size).toBe(0);
  });

  it('rejects unsupported versions and truncated codes', () => {
    expect(() => decodeGggCode('AAAABQA')).toThrow(); // version 5, truncated anyway
    expect(() => decodeGggCode('AAAA')).toThrow();
  });

  it('extracts the code from official site URLs', () => {
    expect(extractCodeFromUrl('https://www.pathofexile.com/passive-skill-tree/AAAABgMAAAAA')).toBe('AAAABgMAAAAA');
    expect(extractCodeFromUrl('https://www.pathofexile.com/fullscreen-passive-skill-tree/3.29.0/AAAABgMAAAAA')).toBe(
      'AAAABgMAAAAA',
    );
    expect(extractCodeFromUrl('AAAABgMAAAAA')).toBe('AAAABgMAAAAA');
  });

  it('encodes real allocated node ids within u16 range', () => {
    const data = loadPassive();
    for (const id of Object.values(data.nodes).map((n) => n.id)) {
      expect(id).toBeGreaterThan(0);
      expect(id).toBeLessThan(65536);
    }
  });
});

describe('URL hash serialization', () => {
  it('round-trips a full build snapshot', () => {
    const snap: BuildSnapshot = {
      tab: 'atlas',
      passive: { classId: 4, ascendancyId: 1, allocated: [100, 200, 300], masteries: [[200, 999]] },
      atlas: { allocated: [500, 600] },
    };
    const hash = serializeBuild(snap);
    const back = deserializeBuild(hash);
    expect(back.tab).toBe('atlas');
    expect(back.passive?.classId).toBe(4);
    expect(back.passive?.ascendancyId).toBe(1);
    expect(back.passive?.allocated.sort((a, b) => a - b)).toEqual([100, 200, 300]);
    expect(back.passive?.masteries).toEqual([[200, 999]]);
    expect(back.atlas?.allocated.sort((a, b) => a - b)).toEqual([500, 600]);
  });

  it('tolerates malformed sections', () => {
    const back = deserializeBuild('#p=@@garbage@@&t=atlas');
    expect(back.passive).toBeUndefined();
    expect(back.tab).toBe('atlas');
  });

  it('empty state serializes to an empty hash', () => {
    const snap: BuildSnapshot = {
      tab: 'passive',
      passive: { classId: 0, ascendancyId: null, allocated: [], masteries: [] },
      atlas: { allocated: [] },
    };
    expect(serializeBuild(snap)).toBe('');
  });
});
