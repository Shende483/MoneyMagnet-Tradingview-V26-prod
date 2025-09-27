import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument ,Schema as MongooseSchema } from 'mongoose';

export type AccountDocument = HydratedDocument<BrokerAccount>;

@Schema({ timestamps: true })
export class BrokerAccount {
@Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  userId: MongooseSchema.Types.ObjectId;

  @Prop({ required: true })
  brokerName: string;

  @Prop({ required: true })
  accountId: string;

  @Prop({ required: true })
  apiKey: string;

   @Prop({ required: true, enum: ['London', 'NewYork'] })
  location: string;

   @Prop({ required: true })
   splittingTarget: number;

  @Prop({ required: true })
  maxPositionLimit: number;

    @Prop({ required: false })
  riskPercentage: number;

  @Prop({ required: false, default: false })
    autoLotSizeSet: boolean;

 @Prop({ required: false })
  dailyRiskPercentage: number; // Optional: Percentage for daily risk limit (e.g., 10 for 10%)

  @Prop({ required: false, default: 0 })
  remainingDailyRisk: number; // Tracks remaining daily risk amount

  @Prop({ required: false })
  lastDailyReset: Date; // Last reset time

  @Prop({ required: false })
  timezone: string; // Optional: User-specified timezone (e.g., 'Asia/Dubai')

    
   @Prop({ type: [String], default: [] })
  favoriteSymbols: string[];

}

export const BrokerAccountSchema = SchemaFactory.createForClass(BrokerAccount);