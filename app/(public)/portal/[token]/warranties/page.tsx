import { redirect } from 'next/navigation';

export default function PortalWarrantiesPage({ params }: { params: { token: string } }) {
  redirect(`/portal/${params.token}#warranties`);
}

