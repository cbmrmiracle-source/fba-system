export default function Login({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <form method="post" action="/api/login" className="card narrow">
      <h1>Sign in</h1>
      {searchParams.error && <p className="error">That password didn&apos;t match.</p>}
      <input type="password" name="password" placeholder="Password" autoFocus required />
      <button type="submit">Sign in</button>
    </form>
  );
}
