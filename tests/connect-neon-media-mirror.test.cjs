const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const {allowedBucket,safeStoragePath,validMirrorItem,validMime,validMirrorToken,validStorageEndpoint,validRedirectUrl}=require('../lib/connect-neon-media-guards.cjs');
const UUID='12345678-1234-4234-9234-123456789012';
test('mirror supports only four Connect private buckets',()=>{
 for(const b of ['connect-avatars','connect-attachments','connect-profile-media','connect-stickers'])assert(allowedBucket(b));
 for(const b of ['avatar','public','connect-admin','connect-attachments/../avatars',''])assert(!allowedBucket(b));
});
test('all mirror object paths are constrained',()=>{
 assert(safeStoragePath('connect-avatars',UUID+'/avatar-1760000.jpg'));
 assert(safeStoragePath('connect-attachments',UUID+'/'+UUID+'/clip.mp4__poster.jpg'));
 assert(safeStoragePath('connect-profile-media',UUID+'/music/example.mp3'));
 assert(safeStoragePath('connect-stickers',UUID+'/'+UUID+'/icon.webp'));
 for(const p of ['../secrets','/absolute','a\\b','a//b','a/../z','a/./x','abc\nxyz','a%2f..',''])assert(!safeStoragePath('connect-attachments',p),p);
});
test('mirror refuses inconsistent bytes, sizes and metadata',()=>{
 const item={bucket_id:'connect-attachments',path:UUID+'/'+UUID+'/x.jpg',source_etag:'abc123',source_size:10,mime_type:'image/jpeg'};
 assert(validMirrorItem(item));
 assert(!validMirrorItem({...item,source_size:0}));
 assert(!validMirrorItem({...item,source_size:104857601}));
 assert(!validMirrorItem({...item,source_etag:''}));
 assert(!validMirrorItem({...item,mime_type:'image/png\r\nX-Injection: yes'}));
 assert(validMime('audio/mp4'));
});
test('webhook token validation is constant-time and exact',()=>{
 const secret='a'.repeat(64);
 assert(validMirrorToken(secret,secret));
 assert(!validMirrorToken('b'.repeat(64),secret));
 assert(!validMirrorToken('',secret));
 assert(!validMirrorToken('a'.repeat(63),secret));
});
test('mirror never routes object writes to another branch or host',()=>{
 assert(validStorageEndpoint('https://br-hidden-math-b9gifypl.storage.c-7.eu-central-1.aws.neon.tech'));
 assert(!validStorageEndpoint('https://br-damp-sound-b9w0ufie.storage.c-7.eu-central-1.aws.neon.tech'));
 assert(!validStorageEndpoint('https://evil.example.com'));
});
test('signed storage redirects are constrained to Neon and the requested path',()=>{
 const uri='https://br-hidden-math-b9gifypl.storage.c-7.eu-central-1.aws.neon.tech/connect-attachments/'+UUID+'/'+UUID+'/a.jpg?X-Amz-Signature=abc';
 assert(validRedirectUrl(uri,'connect-attachments',UUID+'/'+UUID+'/a.jpg'));
 assert(!validRedirectUrl(uri,'connect-avatars',UUID+'/'+UUID+'/a.jpg'));
 assert(!validRedirectUrl(uri.replace('storage.c-7','evil.c-7'),'connect-attachments',UUID+'/'+UUID+'/a.jpg'));
});
test('mirror route requires a secret and verifies downloaded bytes',()=>{
 const s=read('app/api/connect-neon/admin/media-mirror/route.js');
 for(const need of ['validMirrorToken','CONNECT_NEON_MIRROR_HTTP_TOKEN','SUPABASE_SERVICE_ROLE_KEY','GetObjectCommand','PutObjectCommand','connect_neon_media_mirror_confirm','connect_neon_media_mirror_stale','connect_neon_media_mirror_current_avatars'])assert(s.includes(need),need);
 assert(!s.includes('DeleteBucketCommand'));
});
test('private attachment route enforces conversation membership and deletion markers',()=>{
 const s=read('app/api/connect-neon/media/route.js');
 for(const need of ['sessionUser','message_tombstones','hidden_members','deleted_at IS NULL','attachment_path','HeadObjectCommand','GetObjectCommand','createSignedUrl','validRedirectUrl'])assert(s.includes(need),need);
 assert(!s.includes('export async function POST'));
});
