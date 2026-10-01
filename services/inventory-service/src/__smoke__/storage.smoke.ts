import { buildObjectKey, putObject, presignObject, getObject, deleteObject, storageBackend, storageBucket } from '../storage';

console.log('backend:', storageBackend, 'bucket:', storageBucket);
const key = buildObjectKey('hello world.txt', 'robocraft/digital-test');
const body = new TextEncoder().encode('robocraft digital delivery smoke test');
await putObject({ key, body, contentType: 'text/plain' });
console.log('put ok:', key);
const url = await presignObject(key, { expiresIn: 300, downloadName: 'hello world.txt' });
console.log('presigned:', url ? 'yes' : 'no');
if (url) {
  const res = await fetch(url);
  console.log('presigned GET:', res.status, (await res.text()).slice(0, 40));
}
const direct = await getObject(key);
console.log('direct GET:', direct ? new TextDecoder().decode(direct.body) : null);
await deleteObject(key);
console.log('after delete:', await getObject(key));
