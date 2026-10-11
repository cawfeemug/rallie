import { Schema, model, type Types } from 'mongoose';

export type PollType = 'single' | 'multiple';
export type PollStatus = 'draft' | 'open' | 'closed';

export interface IPollOption {
  id: string;
  text: string;
}

export interface IPoll {
  session: Types.ObjectId;
  question: string;
  type: PollType;
  options: IPollOption[];
  status: PollStatus;
  createdAt: Date;
  updatedAt: Date;
}

const optionSchema = new Schema<IPollOption>(
  {
    id: { type: String, required: true },
    text: { type: String, required: true, trim: true, maxlength: 100 },
  },
  { _id: false },
);

const pollSchema = new Schema<IPoll>(
  {
    session: { type: Schema.Types.ObjectId, ref: 'Session', required: true, index: true },
    question: { type: String, required: true, trim: true, maxlength: 200 },
    type: { type: String, enum: ['single', 'multiple'], default: 'single' },
    options: {
      type: [optionSchema],
      validate: {
        validator: (v: unknown[]) => v.length >= 2 && v.length <= 10,
        message: 'A poll needs between 2 and 10 options',
      },
    },
    status: { type: String, enum: ['draft', 'open', 'closed'], default: 'draft' },
  },
  { timestamps: true },
);

export const Poll = model<IPoll>('Poll', pollSchema);
