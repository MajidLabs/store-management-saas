import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * A permanent record of who did what - unlike WebhookEvent/IdempotencyRecord
 * (both operational, both fine to prune eventually), this is meant to be
 * kept indefinitely: "who changed this product's price" or "who suspended
 * this store" is exactly the kind of question support/investigation needs
 * to answer, sometimes long after the event itself.
 *
 * actorEmail/actorRole are denormalized (copied at write time) rather than
 * only referencing actorUserId - so the log still reads correctly even if
 * the user is later deleted or their role changes; an audit trail that
 * changes meaning retroactively when an unrelated user record is edited
 * isn't a trustworthy audit trail.
 */
@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'actor_user_id' })
  actorUserId: string;

  @Column({ name: 'actor_email' })
  actorEmail: string;

  @Column({ name: 'actor_role' })
  actorRole: string;

  /** The store this action happened in context of - null for a
   * cross-tenant SuperAdmin action like suspending a store, where the
   * actor isn't a member of any store. */
  @Column({ name: 'store_id', nullable: true })
  storeId: string | null;

  @Column()
  action: string;

  @Column({ name: 'target_id', nullable: true })
  targetId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: unknown;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
