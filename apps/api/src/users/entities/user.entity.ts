import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { Role } from '../../common/enums/role.enum';
import { Store } from '../../stores/entities/store.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Exclude()
  @Column({ name: 'password_hash', select: false })
  passwordHash: string;

  @Column({ type: 'enum', enum: Role })
  role: Role;

  /** Null only for SUPER_ADMIN, who is not scoped to a single store. */
  @Column({ name: 'store_id', nullable: true })
  storeId: string | null;

  @ManyToOne(() => Store, (store) => store.staff, { nullable: true })
  @JoinColumn({ name: 'store_id' })
  store: Store | null;

  @Exclude()
  @Column({ name: 'refresh_token_hash', nullable: true, select: false })
  refreshTokenHash: string | null;

  /** Hashed (bcrypt), single-use, only ever set while a reset request is pending. Never the raw token. */
  @Exclude()
  @Column({ name: 'password_reset_token_hash', nullable: true, select: false })
  passwordResetTokenHash: string | null;

  @Exclude()
  @Column({ name: 'password_reset_expires_at', nullable: true, select: false })
  passwordResetExpiresAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
