#!/usr/bin/env node
/**
 * Sync local data/ files TO S3
 * 
 * Encrypts sensitive files (ai-providers.json) before uploading.
 * Non-sensitive config files are uploaded as-is.
 * 
 * Usage: node scripts/sync-data-to-s3.js [upload|download]
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const crypto = require('crypto');
const fs = require('fs-extra');
const path = require('path');

const BUCKET = process.env.AWS_S3_BUCKET || 'chatwifi-storage-379611523139';
const REGION = process.env.AWS_REGION || 'us-east-1';
const DATA_DIR = path.join(__dirname, '..', 'data');
const S3_PREFIX = 'app-data/';

// Encryption key from env (same one used for API keys)
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

const s3 = new S3Client({ region: REGION });

// Files that contain sensitive data and MUST be encrypted
const SENSITIVE_FILES = ['ai-providers.json'];

// All data files to sync
const DATA_FILES = [
    'ai-providers.json',
    'ai-fallback.json',
    'ai-automations.json',
    'bot-config.json',
    'blocked-numbers.json',
    'group-categories.json',
    'welcome-automation.json',
    'welcome-user-states.json',
    'chat-history.json'
];

function encrypt(text) {
    const key = Buffer.from(ENCRYPTION_KEY, 'hex');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

function decrypt(encryptedData) {
    const key = Buffer.from(ENCRYPTION_KEY, 'hex');
    const [ivHex, authTagHex, encryptedText] = encryptedData.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

async function upload() {
    console.log('📤 Uploading data files to S3...\n');

    for (const file of DATA_FILES) {
        const filePath = path.join(DATA_DIR, file);
        if (!await fs.pathExists(filePath)) {
            console.log(`  ⏭️  ${file} — not found locally, skipping`);
            continue;
        }

        let content = await fs.readFile(filePath, 'utf8');
        const isSensitive = SENSITIVE_FILES.includes(file);

        if (isSensitive && ENCRYPTION_KEY) {
            content = encrypt(content);
            console.log(`  🔐 ${file} — encrypted and uploading...`);
        } else {
            console.log(`  📄 ${file} — uploading...`);
        }

        await s3.send(new PutObjectCommand({
            Bucket: BUCKET,
            Key: `${S3_PREFIX}${file}${isSensitive ? '.enc' : ''}`,
            Body: content,
            ContentType: 'application/json',
            Metadata: {
                encrypted: isSensitive ? 'true' : 'false',
                uploadedAt: new Date().toISOString()
            }
        }));

        console.log(`  ✅ ${file} — uploaded to s3://${BUCKET}/${S3_PREFIX}${file}`);
    }

    console.log('\n✅ All data files synced to S3!');
}

async function download() {
    console.log('📥 Downloading data files from S3...\n');
    await fs.ensureDir(DATA_DIR);

    // List all files in the S3 prefix
    const listResponse = await s3.send(new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: S3_PREFIX
    }));

    if (!listResponse.Contents || listResponse.Contents.length === 0) {
        console.log('  ⚠️  No data files found in S3. Skipping download.');
        return;
    }

    for (const obj of listResponse.Contents) {
        const s3Key = obj.Key;
        const fileName = s3Key.replace(S3_PREFIX, '').replace('.enc', '');

        try {
            const getResponse = await s3.send(new GetObjectCommand({
                Bucket: BUCKET,
                Key: s3Key
            }));

            let content = await getResponse.Body.transformToString();
            const isEncrypted = s3Key.endsWith('.enc');

            if (isEncrypted && ENCRYPTION_KEY) {
                content = decrypt(content);
                console.log(`  🔓 ${fileName} — decrypted and saved`);
            } else {
                console.log(`  📄 ${fileName} — saved`);
            }

            await fs.writeFile(path.join(DATA_DIR, fileName), content);
        } catch (err) {
            console.error(`  ❌ ${fileName} — error: ${err.message}`);
        }
    }

    console.log('\n✅ All data files downloaded from S3!');
}

// Main
const action = process.argv[2] || 'upload';
if (action === 'upload') {
    upload().catch(console.error);
} else if (action === 'download') {
    download().catch(console.error);
} else {
    console.log('Usage: node sync-data-to-s3.js [upload|download]');
}
