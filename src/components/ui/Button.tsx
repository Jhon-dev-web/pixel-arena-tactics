import type { ButtonHTMLAttributes, ReactNode } from 'react';

// The two buttons of the game. Primary = filled gold (the one main action of a panel: "Publicar oferta", "Forjar"); secondary = dark with a gold border and gold text (the repeated action of a card: "Comprar").
// `danger` is a secondary with a red border (discard). `block` stretches it to the full width; `size="sm"` is the compact one (the minimum touch target is kept on a phone by the CSS).
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'md' | 'sm';
  block?: boolean;
  icon?: ReactNode;
}

export function Button({ variant = 'secondary', size = 'md', block, icon, className = '', children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} className={`ui-btn ${variant}${size === 'sm' ? ' sm' : ''}${block ? ' block' : ''}${className ? ` ${className}` : ''}`} data-ui {...rest}>
      {icon && (
        <span className="ui-btn-icon" aria-hidden>
          {icon}
        </span>
      )}
      {children}
    </button>
  );
}

export const PrimaryButton = (props: Omit<ButtonProps, 'variant'>) => <Button {...props} variant="primary" />;
export const SecondaryButton = (props: Omit<ButtonProps, 'variant'>) => <Button {...props} variant="secondary" />;
