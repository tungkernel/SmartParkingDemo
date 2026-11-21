import { describe, expect, it } from 'vitest';
import { buildVietQrPayload, crc16Ccitt } from '../lib/vietqr';

describe('VietQR EMVCo/NAPAS TLV generator', () => {
  it('computes standard CRC-16/CCITT-FALSE check value for 123456789', () => {
    expect(crc16Ccitt('123456789')).toBe('29B1');
  });

  it('builds a valid dynamic VietQR TLV payload with NAPAS AID and verified CRC', () => {
    const payload = buildVietQrPayload({
      config: {
        bank_bin: '970422',
        account_no: '0123456789',
        account_name: 'SMART PARKING PTIT',
      },
      amount: 15000,
      description: 'PTIT TURN 42 29A12345',
    });

    expect(payload.startsWith('000201010212')).toBe(true);
    expect(payload).toContain('A000000727');
    expect(payload).toContain('QRIBFTTA');
    expect(payload).toContain('5303704');
    expect(payload).toContain('540515000');
    expect(payload).toContain('5802VN');

    const bodyWithTag = payload.slice(0, -4);
    const checksum = payload.slice(-4);
    expect(bodyWithTag.endsWith('6304')).toBe(true);
    expect(crc16Ccitt(bodyWithTag)).toBe(checksum);
  });

  it('builds static QR when amount is 0 and strips Vietnamese diacritics safely', () => {
    const payload = buildVietQrPayload({
      amount: 0,
      description: 'Đỗ xe PTIT Hà Nội',
    });
    expect(payload.startsWith('000201010211')).toBe(true);
    expect(payload).toContain('Do xe PTIT Ha Noi');
  });

  it('guards non-finite amounts and sanitizes non-ASCII account numbers', () => {
    const payload = buildVietQrPayload({
      config: {
        bank_bin: '12', // invalid short BIN -> falls back to 970422
        account_no: ' 0123-456/Đ789 ',
        account_name: 'TEST',
      },
      amount: Number.POSITIVE_INFINITY,
      description: '!!!',
    });
    expect(payload.startsWith('000201010211')).toBe(true);
    expect(payload).not.toContain('Infinity');
    expect(payload).toContain('970422');
    expect(payload).toContain('0123456789');
    const bodyWithTag = payload.slice(0, -4);
    expect(crc16Ccitt(bodyWithTag)).toBe(payload.slice(-4));
  });
});
