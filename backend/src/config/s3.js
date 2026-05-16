/**
 * S3 Helper
 *
 * File operations for S3 storage.
 * Handles knowledge-base documents, chunks, embeddings, and backups.
 */

const {
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
    ListObjectsV2Command,
    DeleteObjectsCommand
} = require('@aws-sdk/client-s3');

const { s3Client, S3_BUCKET } = require('./aws');

/**
 * Upload a file/buffer to S3.
 * @param {string} key - S3 object key (e.g. 'knowledge-base/documents/doc_abc.pdf')
 * @param {Buffer|string} body - File content
 * @param {string} [contentType] - MIME type
 */
async function uploadFile(key, body, contentType) {
    const params = {
        Bucket: S3_BUCKET,
        Key: key,
        Body: body
    };
    if (contentType) params.ContentType = contentType;

    await s3Client.send(new PutObjectCommand(params));
    return key;
}

/**
 * Download a file from S3.
 * @param {string} key - S3 object key
 * @returns {Buffer}
 */
async function downloadFile(key) {
    const result = await s3Client.send(new GetObjectCommand({
        Bucket: S3_BUCKET,
        Key: key
    }));

    // Convert readable stream to buffer
    const chunks = [];
    for await (const chunk of result.Body) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

/**
 * Download a file as UTF-8 string.
 * @param {string} key - S3 object key
 * @returns {string}
 */
async function downloadText(key) {
    const buffer = await downloadFile(key);
    return buffer.toString('utf8');
}

/**
 * Download a JSON file and parse it.
 * @param {string} key - S3 object key
 * @returns {Object|Array}
 */
async function downloadJson(key) {
    const text = await downloadText(key);
    return JSON.parse(text);
}

/**
 * Upload a JSON object to S3.
 * @param {string} key - S3 object key
 * @param {Object|Array} data - Data to serialize
 */
async function uploadJson(key, data) {
    return uploadFile(key, JSON.stringify(data, null, 2), 'application/json');
}

/**
 * Delete a single object from S3.
 * @param {string} key - S3 object key
 */
async function deleteFile(key) {
    await s3Client.send(new DeleteObjectCommand({
        Bucket: S3_BUCKET,
        Key: key
    }));
}

/**
 * List all objects under a prefix.
 * @param {string} prefix - S3 prefix (e.g. 'knowledge-base/chunks/')
 * @returns {Array<{Key: string, Size: number}>}
 */
async function listFiles(prefix) {
    const files = [];
    let continuationToken = undefined;

    do {
        const result = await s3Client.send(new ListObjectsV2Command({
            Bucket: S3_BUCKET,
            Prefix: prefix,
            ContinuationToken: continuationToken
        }));

        if (result.Contents) {
            files.push(...result.Contents.map(obj => ({
                Key: obj.Key,
                Size: obj.Size
            })));
        }

        continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
    } while (continuationToken);

    return files;
}

/**
 * Delete all objects under a prefix.
 * @param {string} prefix - S3 prefix
 */
async function deletePrefix(prefix) {
    const files = await listFiles(prefix);
    if (files.length === 0) return;

    // Delete in batches of 1000
    for (let i = 0; i < files.length; i += 1000) {
        const batch = files.slice(i, i + 1000);
        await s3Client.send(new DeleteObjectsCommand({
            Bucket: S3_BUCKET,
            Delete: {
                Objects: batch.map(f => ({ Key: f.Key }))
            }
        }));
    }
}

/**
 * Check if a file exists in S3.
 * @param {string} key - S3 object key
 * @returns {boolean}
 */
async function fileExists(key) {
    try {
        await s3Client.send(new GetObjectCommand({
            Bucket: S3_BUCKET,
            Key: key
        }));
        return true;
    } catch (err) {
        if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
            return false;
        }
        throw err;
    }
}

module.exports = {
    uploadFile,
    downloadFile,
    downloadText,
    downloadJson,
    uploadJson,
    deleteFile,
    listFiles,
    deletePrefix,
    fileExists
};
