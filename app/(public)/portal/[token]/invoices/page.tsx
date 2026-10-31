import { redirect } from 'next/navigation';

export default function PortalInvoicesPage({ params }: { params: { token: string } }) {
  redirect(`/portal/${params.token}#invoices`);
}

