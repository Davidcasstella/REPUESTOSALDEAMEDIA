/**
 * AWS Configuration
 *
 * Initializes DynamoDB and S3 clients for the application.
 * Uses IAM Role on EC2 (automatic credential resolution).
 * Falls back to ~/.aws/credentials or env vars for local dev.
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
const { S3Client } = require('@aws-sdk/client-s3');

const REGION = process.env.AWS_REGION || 'us-east-1';

// DynamoDB
const dynamoClient = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient, {
    marshallOptions: {
        removeUndefinedValues: true,
        convertClassInstanceToMap: true
    }
});

// S3
const s3Client = new S3Client({ region: REGION });

// Table name prefix — all tables follow: {prefix}-{entity}
const TABLE_PREFIX = process.env.DYNAMODB_PREFIX || 'chatwifi';

// S3 bucket name
const S3_BUCKET = process.env.AWS_S3_BUCKET || '';

/**
 * Build a full DynamoDB table name.
 * @param {string} entity - e.g. 'chat-history', 'config'
 * @returns {string} e.g. 'chatwifi-chat-history'
 */
function tableName(entity) {
    return `${TABLE_PREFIX}-${entity}`;
}

module.exports = {
    docClient,
    s3Client,
    TABLE_PREFIX,
    S3_BUCKET,
    REGION,
    tableName
};
