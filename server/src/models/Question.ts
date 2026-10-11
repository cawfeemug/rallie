import { Schema, model, type Types } from 'mongoose';

export interface IQuestion {
  session: Types.ObjectId;
  text: string;
  authorName: string;
  authorId: string;
  upvoters: string[];
  upvotes: number;
  answered: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const questionSchema = new Schema<IQuestion>(
  {
    session: { type: Schema.Types.ObjectId, ref: 'Session', required: true },
    text: { type: String, required: true, trim: true, maxlength: 280 },
    authorName: { type: String, trim: true, maxlength: 40, default: 'Anonymous' },
    authorId: { type: String, required: true },
    // Hidden by default so voter ids never leak through an accidental query.
    upvoters: { type: [String], default: [], select: false },
    upvotes: { type: Number, default: 0 },
    answered: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// Matches the main read: unanswered first, most upvoted first, oldest first.
questionSchema.index({ session: 1, answered: 1, upvotes: -1, createdAt: 1 });

export const Question = model<IQuestion>('Question', questionSchema);
