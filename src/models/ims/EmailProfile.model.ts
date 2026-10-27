import mongoose, { Document, Schema, Types } from "mongoose";

export interface IEmailProfile extends Document {
  name: string;
  receivableEmail?: string;
  smtp?: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    encryptedPassword?: string;
    from: string;
  };
  assignedPortals: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const emailProfileSchema = new Schema<IEmailProfile>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    receivableEmail: {
      type: String,
      trim: true,
      lowercase: true,
    },
    smtp: {
      host: { type: String, trim: true },
      port: { type: Number },
      secure: { type: Boolean, default: true },
      user: { type: String, trim: true },
      encryptedPassword: { type: String },
      from: { type: String, trim: true },
    },
    assignedPortals: [
      {
        type: Schema.Types.ObjectId,
        ref: "Page",
      },
    ],
  },
  { timestamps: true }
);

export const EmailProfile = mongoose.model<IEmailProfile>("EmailProfile", emailProfileSchema);
