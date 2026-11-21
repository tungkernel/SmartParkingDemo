import type { VietQrConfig } from '../types';

function tlv(id: string, value: string): string {
  const len = value.length.toString().padStart(2, '0');
  return `${id}${len}${value}`;
}

/**
 * Compute CRC-16/CCITT-FALSE (polynomial 0x1021, initial 0xFFFF) per EMVCo QR spec.
 */
export function crc16Ccitt(input: string): string {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i += 1) {
    crc ^= input.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function sanitizeAscii(text: string, maxLen: number): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^A-Za-z0-9 \-_.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

/**
 * Build a standards-compliant EMVCo / NAPAS VietQR (QRIBFTTA) payload
 * scannable by Vietnamese banking apps.
 */
export function buildVietQrPayload(params: {
  config?: VietQrConfig;
  amount: number;
  description: string;
}): string {
  const rawBin = (params.config?.bank_bin || '970422').replace(/\D/g, '').slice(0, 6);
  const bankBin = rawBin.length === 6 ? rawBin : '970422';
  const rawAccount = (params.config?.account_no || '0123456789')
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 38);
  const accountNo = rawAccount || '0123456789';
  const cleanAmount =
    Number.isFinite(params.amount) && params.amount > 0 ? Math.round(params.amount) : 0;
  const cleanDesc = sanitizeAscii(params.description, 50);

  // Field 38: Merchant Account Information (NAPAS VietQR)
  const beneficiary = tlv('00', bankBin) + tlv('01', accountNo);
  const napasAccountInfo = tlv('00', 'A000000727') + tlv('01', beneficiary) + tlv('02', 'QRIBFTTA');

  const parts: string[] = [
    tlv('00', '01'), // Payload Format Indicator
    tlv('01', cleanAmount > 0 ? '12' : '11'), // 12 = Dynamic QR, 11 = Static QR
    tlv('38', napasAccountInfo),
    tlv('53', '704'), // Currency VND
  ];

  if (cleanAmount > 0) {
    parts.push(tlv('54', String(cleanAmount)));
  }

  parts.push(tlv('58', 'VN'));

  if (cleanDesc) {
    parts.push(tlv('62', tlv('08', cleanDesc)));
  }

  const bodyWithCrcTag = `${parts.join('')}6304`;
  return `${bodyWithCrcTag}${crc16Ccitt(bodyWithCrcTag)}`;
}
