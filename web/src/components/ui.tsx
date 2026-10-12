import { useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import {
  PAYMENT_LABELS,
  initials,
  money,
  shortDate,
  statusLabel,
  time12,
  time24,
  type Category,
  type OrderStatus,
  type PaymentStatus,
} from '@cds/shared';

// Buttons -------------------------------------------------------------------

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type Size = 'sm' | 'md' | 'lg' | 'xl';

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  icon?: ReactNode;
  loading?: boolean;
  iconOnly?: boolean;
}

export function Button({ variant = 'secondary', size = 'md', block, icon, loading, iconOnly, className, children, disabled, type = 'button', ...rest }: BtnProps) {
  return (
    <button
      type={type}
      className={clsx(
        'btn',
        variant !== 'secondary' && `btn-${variant}`,
        size !== 'md' && `btn-${size}`,
        block && 'btn-block',
        iconOnly && 'btn-icon',
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <span className="spinner" style={{ width: 16, height: 16, borderTopColor: 'currentColor' }} /> : icon}
      {children}
    </button>
  );
}

export function ButtonLink({ to, variant = 'secondary', size = 'md', icon, children, block, className }: { to: string; variant?: Variant; size?: Size; icon?: ReactNode; children: ReactNode; block?: boolean; className?: string }) {
  return (
    <Link to={to} className={clsx('btn', variant !== 'secondary' && `btn-${variant}`, size !== 'md' && `btn-${size}`, block && 'btn-block', className)}>
      {icon}
      {children}
    </Link>
  );
}

// Form fields ----------------------------------------------------------------

interface FieldProps {
  label?: ReactNode;
  help?: ReactNode;
  error?: string;
  required?: boolean;
  optional?: boolean;
  className?: string;
  children: (id: string) => ReactNode;
}

export function Field({ label, help, error, required, optional, className, children }: FieldProps) {
  const id = useId();
  return (
    <div className={clsx('field', className)}>
      {label && (
        <label className="label" htmlFor={id}>
          {label}
          {required && <span className="req">*</span>}
          {optional && <span className="opt">optional</span>}
        </label>
      )}
      {children(id)}
      {error ? <div className="error-text">{error}</div> : help ? <div className="help">{help}</div> : null}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode; help?: ReactNode; error?: string; optional?: boolean; wrapClass?: string };

export function TextField({ label, help, error, required, optional, wrapClass, className, ...rest }: InputProps) {
  return (
    <Field label={label} help={help} error={error} required={required} optional={optional} className={wrapClass}>
      {(id) => <input id={id} className={clsx('input', className)} aria-invalid={!!error} required={required} {...rest} />}
    </Field>
  );
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: React.Ref<HTMLTextAreaElement>; label?: ReactNode; help?: ReactNode; error?: string; optional?: boolean; wrapClass?: string };

export function TextArea({ label, help, error, required, optional, wrapClass, className, ...rest }: TextareaProps) {
  return (
    <Field label={label} help={help} error={error} required={required} optional={optional} className={wrapClass}>
      {(id) => <textarea id={id} className={clsx('textarea', className)} aria-invalid={!!error} required={required} {...rest} />}
    </Field>
  );
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: ReactNode;
  help?: ReactNode;
  error?: string;
  optional?: boolean;
  wrapClass?: string;
  options: { value: string | number; label: string }[];
  placeholder?: string;
};

export function SelectField({ label, help, error, required, optional, wrapClass, className, options, placeholder, ...rest }: SelectProps) {
  return (
    <Field label={label} help={help} error={error} required={required} optional={optional} className={wrapClass}>
      {(id) => (
        <select id={id} className={clsx('select', className)} aria-invalid={!!error} required={required} {...rest}>
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

export function Switch({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="row top" style={{ justifyContent: 'space-between', gap: 16 }}>
      <label htmlFor={id} style={{ cursor: 'pointer', flex: 1 }}>
        <div className="strong" style={{ fontSize: 14.5 }}>
          {label}
        </div>
        {description && <div className="help">{description}</div>}
      </label>
      <span className="switch">
        <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <span />
      </span>
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; count?: number }[]; label?: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
          {o.count !== undefined && o.count > 0 && <span className="count">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

// Containers -----------------------------------------------------------------

export function Card({ title, eyebrow, actions, children, className, footer, pad = true }: { title?: ReactNode; eyebrow?: ReactNode; actions?: ReactNode; children?: ReactNode; className?: string; footer?: ReactNode; pad?: boolean }) {
  return (
    <section className={clsx('card', className)}>
      {(title || actions || eyebrow) && (
        <header className="card-header">
          <div className="stack" style={{ gap: 2, minWidth: 0, flex: 1 }}>
            {eyebrow && <div className="eyebrow">{eyebrow}</div>}
            {title && <h2>{title}</h2>}
          </div>
          {actions && <div className="row">{actions}</div>}
        </header>
      )}
      {pad ? <div className="card-body">{children}</div> : children}
      {footer && <footer className="card-footer">{footer}</footer>}
    </section>
  );
}

export function PageHeader({ eyebrow, title, sub, actions, back }: { eyebrow?: ReactNode; title: ReactNode; sub?: ReactNode; actions?: ReactNode; back?: { to: string; label: string } }) {
  return (
    <div className="page-header">
      <div style={{ minWidth: 0 }}>
        {back && (
          <Link to={back.to} className="back-link">
            <ArrowLeft /> {back.label}
          </Link>
        )}
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}

export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      {icon && <div className="empty-icon">{icon}</div>}
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}

export function Alert({ tone = 'info', children, title }: { tone?: 'info' | 'warn' | 'danger' | 'success'; children: ReactNode; title?: ReactNode }) {
  const Icon = tone === 'warn' ? AlertTriangle : tone === 'danger' ? XCircle : tone === 'success' ? CheckCircle2 : Info;
  return (
    <div className={`alert alert-${tone}`} role={tone === 'danger' ? 'alert' : undefined}>
      <Icon />
      <div className="stack" style={{ gap: 2 }}>
        {title && <strong>{title}</strong>}
        <div>{children}</div>
      </div>
    </div>
  );
}

export function Skeleton({ h = 14, w = '100%', style }: { h?: number; w?: number | string; style?: React.CSSProperties }) {
  return <div className="skeleton" style={{ height: h, width: w, ...style }} />;
}

export function LoadingRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="stack" style={{ padding: 20, gap: 16 }}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="row" style={{ gap: 14 }}>
          <Skeleton h={52} w={60} />
          <div className="stack" style={{ flex: 1, gap: 8 }}>
            <Skeleton h={14} w="55%" />
            <Skeleton h={12} w="35%" />
          </div>
        </div>
      ))}
    </div>
  );
}

// Modal ------------------------------------------------------------------------

export function Modal({ open, onClose, title, children, footer, width }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const first = ref.current?.querySelector<HTMLElement>('input, textarea, select, button:not([data-close])');
    first?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" ref={ref} style={{ ['--w' as string]: width ? `${width}px` : undefined }}>
        <div className="modal-header">
          <h2 style={{ flex: 1 }}>{title}</h2>
          <Button variant="ghost" iconOnly size="sm" onClick={onClose} aria-label="Close" data-close>
            <X />
          </Button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

// Domain atoms -------------------------------------------------------------------

const STATUS_TONE: Record<OrderStatus, string> = {
  proposed: 'violet',
  requested: 'warn',
  confirmed: 'info',
  picking_up: 'violet',
  picked_up: 'violet',
  en_route: 'violet',
  delivered: 'success',
  declined: 'danger',
  cancelled: 'outline',
};

export function StatusBadge({ status, category }: { status: OrderStatus; category?: Category | null }) {
  const live = ['picking_up', 'picked_up', 'en_route'].includes(status);
  return (
    <span className={`badge badge-${STATUS_TONE[status]}`}>
      <span className={clsx('dot', live && 'live')} />
      {statusLabel(status, category ?? null)}
    </span>
  );
}

const PAY_TONE: Record<PaymentStatus, string> = {
  unpaid: 'warn',
  reported: 'info',
  paid: 'success',
  covered: 'success',
  waived: 'outline',
  refunded: 'outline',
};

export function PaymentBadge({ status, short }: { status: PaymentStatus; short?: boolean }) {
  const label = short && status === 'reported' ? 'Verifying' : PAYMENT_LABELS[status];
  return <span className={`badge badge-${PAY_TONE[status]}`}>{label}</span>;
}

export function Money({ cents, className }: { cents: number; className?: string }) {
  return <span className={clsx('mono', className)}>{money(cents)}</span>;
}

/** Shows military time first (the Academy's convention) with civilian time beside it. */
export function Clock({ time, compact }: { time: string; compact?: boolean }) {
  if (compact) return <span className="mono">{time24(time)}</span>;
  return (
    <span className="nowrap">
      <span className="mono strong">{time24(time)}</span> <span className="muted">· {time12(time)}</span>
    </span>
  );
}

export function DateBlock({ date, time }: { date: string; time?: string }) {
  const [, m, d] = date.split('-').map(Number);
  const dow = shortDate(date).slice(0, 3);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return (
    <div className="date-block" aria-label={shortDate(date)}>
      <div className="dow">{dow}</div>
      <div className="day">{d}</div>
      <div className="time">{time ? time24(time) : months[m - 1]}</div>
    </div>
  );
}

export function Avatar({ first, last, size, staff }: { first?: string | null; last?: string | null; size?: 'sm' | 'lg'; staff?: boolean }) {
  return <span className={clsx('avatar', size, staff && 'staff')}>{initials(first, last)}</span>;
}
