import { Schema, model, type Types } from 'mongoose';

export interface IVote {
  poll: Types.ObjectId;
  voterId: string;
  choices: string[];
  createdAt: Date;
  updatedAt: Date;
}

const voteSchema = new Schema<IVote>(
  {
    poll: { type: Schema.Types.ObjectId, ref: 'Poll', required: true },
    voterId: { type: String, required: true },
    choices: { type: [String], required: true },
  },
  { timestamps: true },
);

// The database, not application code, enforces "one vote per participant per poll".
// Two simultaneous requests cannot both succeed: the second insert fails with E11000.
voteSchema.index({ poll: 1, voterId: 1 }, { unique: true });

export const Vote = model<IVote>('Vote', voteSchema);
