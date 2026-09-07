import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Plan } from '../../common/enums/plan.enum';
import { SubscriptionStatus } from '../../common/enums/subscription-status.enum';
import { Store } from '../../stores/entities/store.entity';

@Entity('subscriptions')
export class Subscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'store_id', unique: true })
  storeId: string;

  @OneToOne(() => Store, (store) => store.subscription)
  @JoinColumn({ name: 'store_id' })
  store: Store;

  @Column({ type: 'enum', enum: Plan, default: Plan.FREE })
  plan: Plan;

  @Column({
    type: 'enum',
    enum: SubscriptionStatus,
    default: SubscriptionStatus.ACTIVE,
  })
  status: SubscriptionStatus;

  /** Populated once a real Stripe checkout has happened - null under the mock provider. */
  @Column({ name: 'stripe_customer_id', nullable: true })
  stripeCustomerId: string | null;

  @Column({ name: 'stripe_subscription_id', nullable: true })
  stripeSubscriptionId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
