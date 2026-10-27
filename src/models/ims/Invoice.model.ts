import mongoose, { Schema, Document } from 'mongoose';

export interface IInvoiceLineItem {
  orderId: mongoose.Types.ObjectId;
  orderLocalId: string;
  poNumber?: string;
  employeeName: string;
  employeeEmail?: string;
  employeeGroup: string;
  orderDate: Date;
  items: {
    sku: string;
    productName: string;
    variantName?: string;
    qty: number;
    unitPrice: number;
    originalPrice?: number;
    contractPrice?: number;
    allotmentPerUnit: number;
    cashPerUnit: number;
    lineTotal: number;
  }[];
  orderSubtotal: number;
  orderTax: number;
  orderGrandTotal: number;
  allotmentAmount: number;
  cashPaidByEmployee: number;
  paymentMethod: string;
}

export interface IInvoice extends Document {
  invoiceNumber: string;
  companyName: string;
  companyType: 'portal' | 'walkin' | 'both';
  portalId?: mongoose.Types.ObjectId;
  portalName?: string;
  groupId?: mongoose.Types.ObjectId;
  groupName?: string;
  dateFrom: Date;
  dateTo: Date;
  invoiceDate: Date;
  dueDate?: Date;
  status: 'draft' | 'sent' | 'paid' | 'overdue';
  totalOrders: number;
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
  cashPaidTotal: number;
  lineItems: IInvoiceLineItem[];
  title?: string;
  notes?: string;
  emailLog: {
    sentTo: string;
    sentAt: Date;
    sentBy: string;
  }[];
  paidAt?: Date;
  paidReference?: string;
  paidNotes?: string;
  createdBy: string;
  poNumber?: string;
}

const InvoiceLineItemSchema = new Schema<IInvoiceLineItem>({
  orderId: { type: Schema.Types.ObjectId, ref: 'PosOrder', required: true },
  orderLocalId: { type: String, required: true },
  poNumber: { type: String },
  employeeName: { type: String, required: true },
  employeeEmail: { type: String },
  employeeGroup: { type: String, default: 'N/A' },
  orderDate: { type: Date, required: true },
  items: [{
    sku: { type: String, required: true },
    productName: { type: String, required: true },
    variantName: { type: String },
    qty: { type: Number, required: true },
    unitPrice: { type: Number, required: true },
    originalPrice: { type: Number },
    contractPrice: { type: Number },
    allotmentPerUnit: { type: Number, required: true },
    cashPerUnit: { type: Number, required: true },
    lineTotal: { type: Number, required: true }
  }],
  orderSubtotal: { type: Number, required: true },
  orderTax: { type: Number, required: true },
  orderGrandTotal: { type: Number, required: true },
  allotmentAmount: { type: Number, required: true },
  cashPaidByEmployee: { type: Number, required: true },
  paymentMethod: { type: String, required: true }
});

const InvoiceSchema = new Schema<IInvoice>(
  {
    invoiceNumber: { type: String, required: true, unique: true },
    companyName: { type: String, required: true },
    companyType: { type: String, enum: ['portal', 'walkin', 'both'], required: true },
    portalId: { type: Schema.Types.ObjectId, ref: 'Page' },
    portalName: { type: String },
    groupId: { type: Schema.Types.ObjectId, ref: 'EmployeeGroup' },
    groupName: { type: String },
    dateFrom: { type: Date, required: true },
    dateTo: { type: Date, required: true },
    invoiceDate: { type: Date, default: Date.now, required: true },
    dueDate: { type: Date },
    status: { type: String, enum: ['draft', 'sent', 'paid', 'overdue'], default: 'draft', required: true },
    totalOrders: { type: Number, required: true },
    subtotal: { type: Number, required: true },
    taxTotal: { type: Number, required: true },
    grandTotal: { type: Number, required: true },
    cashPaidTotal: { type: Number, required: true },
    lineItems: [InvoiceLineItemSchema],
    title: { type: String },
    notes: { type: String },
    emailLog: [{
      sentTo: { type: String, required: true },
      sentAt: { type: Date, default: Date.now, required: true },
      sentBy: { type: String, required: true }
    }],
    paidAt: { type: Date },
    paidReference: { type: String },
    paidNotes: { type: String },
    createdBy: { type: String, required: true },
    poNumber: { type: String },
  },
  { timestamps: true }
);

export const Invoice = mongoose.model<IInvoice>('Invoice', InvoiceSchema);
export default Invoice;
