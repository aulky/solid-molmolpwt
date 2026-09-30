import { Router, useLocation } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { Suspense, Show } from "solid-js";
import Nav from "~/components/Nav";
import "./app.css";

function AppContent(props: { children?: any }) {
  const location = useLocation();
  const isAdmin = () => location.pathname.startsWith("/admin");

  return (
    <>
      <Show when={!isAdmin()}>
        <Nav />
      </Show>
      <Suspense>{props.children}</Suspense>
    </>
  );
}

export default function App() {
  return (
    <Router root={props => <AppContent>{props.children}</AppContent>}>
      <FileRoutes />
    </Router>
  );
}
