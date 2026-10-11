import { QRCodeSVG } from 'qrcode.react';
import { joinUrl } from '../util';

/** QR code for the participant join link. Dark on white at all times so phone cameras can read it. */
export function JoinQR({ code, size = 150 }: { code: string; size?: number }) {
  return (
    <div className="qr">
      <QRCodeSVG value={joinUrl(code)} size={size} level="M" bgColor="#ffffff" fgColor="#15183b" title={`Join session ${code}`} />
    </div>
  );
}
