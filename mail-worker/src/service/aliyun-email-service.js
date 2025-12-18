/**
 * 阿里云邮件推送服务
 * 使用 DirectMail API (HTTP)
 * 适配 Cloudflare Workers 环境（使用 Web Crypto API）
 */
const aliyunEmailService = {

    /**
     * 发送邮件
     * @param {Object} config - 阿里云配置 { accessKeyId, accessKeySecret, region, fromAddress }
     * @param {Object} params - 邮件参数 { toAddress, subject, htmlBody, fromAlias }
     */
    async send(config, params) {
        const { accessKeyId, accessKeySecret, region = 'cn-hangzhou', fromAddress } = config;
        const { toAddress, subject, htmlBody, fromAlias = 'Campaign' } = params;

        // 构建请求参数
        const requestParams = {
            Action: 'SingleSendMail',
            AccountName: fromAddress,
            ReplyToAddress: 'false',
            AddressType: '1',
            ToAddress: toAddress,
            FromAlias: fromAlias,
            Subject: subject,
            HtmlBody: htmlBody,
            // 公共参数
            Format: 'JSON',
            Version: '2015-11-23',
            AccessKeyId: accessKeyId,
            SignatureMethod: 'HMAC-SHA1',
            Timestamp: new Date().toISOString(),
            SignatureVersion: '1.0',
            SignatureNonce: Math.random().toString(36).substring(2),
            RegionId: region
        };

        // 生成签名
        const signature = await this.generateSignature(requestParams, accessKeySecret);
        requestParams.Signature = signature;

        // 构建 URL
        const endpoint = `https://dm.aliyuncs.com/`;
        const queryString = this.buildQueryString(requestParams);

        // 发送请求
        try {
            const response = await fetch(`${endpoint}?${queryString}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const result = await response.json();

            if (result.Code) {
                throw new Error(`Aliyun API Error: ${result.Code} - ${result.Message}`);
            }

            return {
                success: true,
                messageId: result.EnvId,
                requestId: result.RequestId
            };
        } catch (error) {
            console.error('Aliyun send email failed:', error);
            throw error;
        }
    },

    /**
     * 生成阿里云 API 签名（使用 Web Crypto API）
     */
    async generateSignature(params, accessKeySecret) {
        // 1. 排序参数
        const sortedKeys = Object.keys(params).sort();

        // 2. 构建规范化查询字符串
        const canonicalizedQueryString = sortedKeys
            .map(key => `${this.percentEncode(key)}=${this.percentEncode(params[key])}`)
            .join('&');

        // 3. 构建待签名字符串
        const stringToSign = `GET&${this.percentEncode('/')}&${this.percentEncode(canonicalizedQueryString)}`;

        // 4. 计算签名（使用 Web Crypto API）
        const encoder = new TextEncoder();
        const keyData = encoder.encode(`${accessKeySecret}&`);
        const messageData = encoder.encode(stringToSign);

        const cryptoKey = await crypto.subtle.importKey(
            'raw',
            keyData,
            { name: 'HMAC', hash: 'SHA-1' },
            false,
            ['sign']
        );

        const signatureBuffer = await crypto.subtle.sign(
            'HMAC',
            cryptoKey,
            messageData
        );

        // 5. Base64 编码
        const signatureArray = new Uint8Array(signatureBuffer);
        const signature = btoa(String.fromCharCode(...signatureArray));

        return signature;
    },

    /**
     * URL 编码（符合阿里云规范）
     */
    percentEncode(str) {
        return encodeURIComponent(str)
            .replace(/!/g, '%21')
            .replace(/'/g, '%27')
            .replace(/\(/g, '%28')
            .replace(/\)/g, '%29')
            .replace(/\*/g, '%2A');
    },

    /**
     * 构建查询字符串
     */
    buildQueryString(params) {
        return Object.keys(params)
            .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
            .join('&');
    }
};

export default aliyunEmailService;
