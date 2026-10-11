import { Schema, model, type Types } from 'mongoose';

export type SessionStatus = 'live' | 'ended';

export interface ISession {
  code: string;
  title: string;
  host: Types.ObjectId;
  status: SessionStatus;
  createdAt: Date;
  updatedAt: Date;
}

const sessionSchema = new Schema<ISession>(
  {
    // Short join code shown on the projector / encoded in the QR code.
    code: { type: String, required: true, unique: true, uppercase: true, match: /^[A-Z0-9]{6}$/ },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    host: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    status: { type: String, enum: ['live', 'ended'], default: 'live' },
  },
  { timestamps: true },
);

export const Session = model<ISession>('Session', sessionSchema);
