import { Check, CheckCheck, Clock3 } from 'lucide-react';

const LABEL = { pending: 'Pendente', sent: 'Enviada', delivered: 'Entregue', read: 'Lida', played: 'Reproduzida' };

/** Indicador de status (relógio, ✓, ✓✓ cinza, ✓✓ azul) */
export default function Status({ status, className = '' }) {
  if (!status) return null;
  const common = { size: 16, strokeWidth: 2.2, 'aria-label': LABEL[status] };
  let icon;
  if (status === 'pending') icon = <Clock3 {...common} size={14} />;
  else if (status === 'sent') icon = <Check {...common} />;
  else if (status === 'delivered') icon = <CheckCheck {...common} />;
  else icon = <CheckCheck {...common} />;
  const blue = status === 'read' || status === 'played';
  return (
    <span title={LABEL[status]} className={`inline-flex ${blue ? 'text-check' : ''} ${className}`}>
      {icon}
    </span>
  );
}
