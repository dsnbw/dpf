const http = require('node:http');
const https = require('node:https');
const { URL } = require('node:url');

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 64, timeout: 30000 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 64, timeout: 30000 });

/**
 * HttpClient handles range requests, keep-alive connections, and redirect resolution.
 */
class HttpClient {
  /**
   * Probes URL to get Content-Length, Accept-Ranges, ETag, and suggested filename.
   * @param {string} targetUrl 
   * @param {Record<string, string>} customHeaders 
   * @returns {Promise<{ url: string, totalSize: number, supportsRanges: boolean, etag: string, filename: string, contentType: string }>}
   */
  static async probeUrl(targetUrl, customHeaders = {}) {
    let currentUrl = targetUrl;
    let hops = 0;

    while (hops < 10) {
      hops++;
      const parsedUrl = new URL(currentUrl);
      const isHttps = parsedUrl.protocol === 'https:';
      const client = isHttps ? https : http;
      const agent = isHttps ? httpsAgent : httpAgent;

      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 DPF/1.0',
        'Accept': '*/*',
        ...customHeaders
      };

      const result = await new Promise((resolve, reject) => {
        const req = client.request(parsedUrl, { method: 'HEAD', agent, headers }, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            const redirectUrl = new URL(res.headers.location, currentUrl).href;
            resolve({ redirect: redirectUrl });
            return;
          }

          const contentLength = parseInt(res.headers['content-length'] || '0', 10);
          const acceptRanges = res.headers['accept-ranges'];
          const supportsRanges = acceptRanges === 'bytes' || contentLength > 0;
          const etag = res.headers['etag'] || '';
          const contentType = res.headers['content-type'] || 'application/octet-stream';

          let filename = '';
          const disposition = res.headers['content-disposition'];
          if (disposition) {
            const match = disposition.match(/filename\*?=['"]?(?:UTF-8'')?([^'";\n]+)['"]?/i);
            if (match && match[1]) {
              filename = decodeURIComponent(match[1]);
            }
          }
          if (!filename) {
            const pathname = parsedUrl.pathname;
            const basename = pathname.substring(pathname.lastIndexOf('/') + 1);
            filename = basename ? decodeURIComponent(basename) : 'download.bin';
          }

          resolve({
            url: currentUrl,
            totalSize: contentLength,
            supportsRanges,
            etag,
            filename,
            contentType
          });
        });

        req.on('error', reject);
        req.setTimeout(15000, () => {
          req.destroy(new Error('Request timed out probing URL'));
        });
        req.end();
      });

      if (result.redirect) {
        currentUrl = result.redirect;
      } else {
        return result;
      }
    }

    throw new Error('Too many redirects');
  }

  /**
   * Opens an HTTP stream for a specific byte range.
   * @param {string} targetUrl 
   * @param {number} start 
   * @param {number} end 
   * @param {Record<string, string>} customHeaders 
   * @returns {Promise<import('node:stream').Readable>}
   */
  static getRangeStream(targetUrl, start, end, customHeaders = {}) {
    const parsedUrl = new URL(targetUrl);
    const isHttps = parsedUrl.protocol === 'https:';
    const client = isHttps ? https : http;
    const agent = isHttps ? httpsAgent : httpAgent;

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 DPF/1.0',
      'Accept': '*/*',
      ...customHeaders
    };

    if (end > 0 && end >= start) {
      headers['Range'] = `bytes=${start}-${end}`;
    }

    return new Promise((resolve, reject) => {
      const req = client.request(parsedUrl, { method: 'GET', agent, headers }, (res) => {
        if (res.statusCode >= 400) {
          reject(new Error(`Server returned HTTP status ${res.statusCode}`));
          return;
        }
        resolve(res);
      });

      req.on('error', reject);
      req.end();
    });
  }
}

module.exports = { HttpClient };
