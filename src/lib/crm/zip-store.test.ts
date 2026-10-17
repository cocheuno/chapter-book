import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { crc32, zipStore } from "./zip-store.ts";

function readZip(bytes: Uint8Array): { name: string; data: Uint8Array }[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.ok(bytes.length >= 22);
  const eocd = bytes.length - 22;
  assert.equal(view.getUint32(eocd, true), 0x06054b50);
  const count = view.getUint16(eocd + 10, true);
  assert.equal(view.getUint16(eocd + 8, true), count);
  assert.equal(view.getUint16(eocd + 20, true), 0);
  let pos = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const files: { name: string; data: Uint8Array }[] = [];
  for (let n = 0; n < count; n += 1) {
    assert.equal(view.getUint32(pos, true), 0x02014b50);
    assert.equal(view.getUint16(pos + 8, true) & 0x0800, 0x0800);
    assert.equal(view.getUint16(pos + 10, true), 0);
    const size = view.getUint32(pos + 20, true);
    const nameLen = view.getUint16(pos + 28, true);
    const extraLen = view.getUint16(pos + 30, true);
    const commentLen = view.getUint16(pos + 32, true);
    const localOffset = view.getUint32(pos + 42, true);
    const name = decoder.decode(bytes.subarray(pos + 46, pos + 46 + nameLen));
    assert.equal(view.getUint32(localOffset, true), 0x04034b50);
    assert.equal(view.getUint16(localOffset + 6, true) & 0x0800, 0x0800);
    assert.equal(view.getUint16(localOffset + 8, true), 0);
    const localNameLen = view.getUint16(localOffset + 26, true);
    const localExtraLen = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + localNameLen + localExtraLen;
    files.push({ name, data: bytes.slice(start, start + size) });
    pos += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

describe("crc32", () => {
  it("matches the standard values", () => {
    assert.equal(crc32(new Uint8Array()), 0);
    assert.equal(crc32(new TextEncoder().encode("hello")), 0x3610a686);
  });
});

describe("zipStore", () => {
  it("writes a stored zip and round-trips every file", () => {
    const hello = new TextEncoder().encode("hello");
    const note = new TextEncoder().encode("Ada\nline");
    const zip = zipStore(
      [
        { name: "a.txt", data: hello },
        { name: "b.txt", data: note },
      ],
      new Date(2026, 9, 16, 10, 4, 6),
    );
    assert.equal(zip[0], 0x50);
    assert.equal(zip[1], 0x4b);
    assert.equal(zip[2], 0x03);
    assert.equal(zip[3], 0x04);
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    assert.equal(view.getUint32(zip.length - 22, true), 0x06054b50);
    assert.equal(view.getUint16(zip.length - 12, true), 2);
    const files = readZip(zip);
    assert.equal(files.length, 2);
    assert.equal(files[0].name, "a.txt");
    assert.equal(files[1].name, "b.txt");
    assert.deepEqual(files[0].data, hello);
    assert.deepEqual(files[1].data, note);
  });

  it("round-trips two files that hold the same bytes", () => {
    const shared = new TextEncoder().encode("same");
    const snapshot = shared.slice();
    const zip = zipStore(
      [
        { name: "one.txt", data: shared },
        { name: "two.txt", data: shared },
      ],
      new Date(2026, 9, 16, 10, 4, 8),
    );
    assert.deepEqual(shared, snapshot);
    const files = readZip(zip);
    assert.deepEqual(
      files.map((file) => file.name),
      ["one.txt", "two.txt"],
    );
    assert.deepEqual(files[0].data, snapshot);
    assert.deepEqual(files[1].data, snapshot);
  });
});
