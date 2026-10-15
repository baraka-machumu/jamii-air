// Each section's page arrives with its own task (4.3 Dashboard, 4.4 Reports, 4.5 Users,
// 4.6 Invite codes / Audit log / Admins). Until then the route exists so the frame, the guards and
// the navigation can be built and tested, and it says which task fills it in rather than
// pretending to be empty data.
export function Placeholder({ title, task }: { title: string; task: string }) {
  return (
    <section>
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="mt-2 text-muted-foreground">Built in task {task}.</p>
    </section>
  );
}
