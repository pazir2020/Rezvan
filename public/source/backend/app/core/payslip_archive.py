"""Format and size check for explicit, immutable payslip PDF archival.

Not an authenticity/amount checker; that remains a human payroll approval.
"""
import hashlib


def store_payslip_pdf(stream, dest, max_bytes):
    digest = hashlib.sha256()
    count = 0
    header, tail = b'', b''
    with open(dest, 'xb') as fp:
        while True:
            chunk = stream.read(1024 * 1024)
            if not chunk:
                break
            count += len(chunk)
            if count > max_bytes:
                raise ValueError('حجم PDF بیش از حد مجاز است')
            if len(header) < 8:
                header += chunk[:8-len(header)]
            tail = (tail + chunk)[-4096:]
            digest.update(chunk)
            fp.write(chunk)
    if count < 20 or not header.startswith(b'%PDF-') or b'%%EOF' not in tail:
        raise ValueError('فایل ارسالی PDF معتبر به نظر نمی‌رسد')
    return count, digest.hexdigest()

