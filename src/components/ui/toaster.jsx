import React from 'react';
import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from '@/components/ui/toast';
import { useToast } from '@/components/ui/use-toast';
import { AlertCircle, CheckCircle, Info, Sparkles } from 'lucide-react';

export function Toaster() {
	const { toasts } = useToast();

	const getIcon = (variant, title) => {
		if (variant === 'destructive') return <AlertCircle className="text-destructive" />;
        if (variant === 'success') return <CheckCircle className="text-green-500" />;
		if (title && (title.includes('✨') || title.includes('🎉'))) return <Sparkles className="text-yellow-500" />;
		return <Info className="text-primary" />;
	};

	return (
		<ToastProvider>
			{toasts.map(({ id, title, description, action, variant, ...props }) => {
				return (
					<Toast key={id} variant={variant} {...props}>
						<div className="flex items-start gap-3">
							<div className="mt-0.5">{getIcon(variant, title)}</div>
							<div className="grid gap-1">
								{title && <ToastTitle>{title}</ToastTitle>}
								{description && <ToastDescription>{description}</ToastDescription>}
							</div>
						</div>
						{action}
						<ToastClose />
					</Toast>
				);
			})}
			<ToastViewport />
		</ToastProvider>
	);
}