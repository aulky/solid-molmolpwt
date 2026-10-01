---
trigger: glob
globs: "**/kustomization.yaml,**/Chart.yaml,**/values.yaml,**/values-*.yaml,**/*.k8s.yaml,**/helmfile.yaml"
description: "Kubernetes, Helm and Kustomize card: offline render/validate commands, cluster-safety and manifest invariants, YAML pitfalls, bad->good example. Loaded when editing charts, values or kustomizations."
---
# Kubernetes / Helm / Kustomize - topic card
Principles guides: `.agents/guides/principles/security.md` (least privilege, secrets) and `.agents/guides/principles/architecture.md` (service boundaries). Plain manifests with other names (`deployment.yaml`) do not load this card; apply it to them too.

## Toolchain (offline first; the project's scripts win)
- Render: `helm template <release> <chart-dir> -f <values.yaml>` - `kubectl kustomize <dir>` (or `kustomize build <dir>`).
- Lint and validate offline: `helm lint <chart-dir>` - `kubeconform -strict` on the rendered output if installed. `kubectl apply --dry-run=client` is NOT offline: it needs a reachable API server for its schema.
- Against a cluster (read-only, only with the user's OK in your brief; else skip it and write `Not run: <command> (needs the user's OK)` in your Worker Report; validation is partial, not BLOCKED): `kubectl config current-context`, then `kubectl diff -f <file>` or `kubectl apply --dry-run=server -f <file>`. No cluster -> report validation as partial.
- Look up a field instead of guessing: `kubectl explain deployment.spec.template.spec.containers` (needs a cluster: same OK rule) or the official API reference via `/research-docs`.

## Invariants (MUST / NEVER - with reason -> alternative)
1. NEVER run `kubectl apply|delete|patch|scale|rollout`, `helm install|upgrade|uninstall|rollback` or `helmfile apply|sync` - they change a live cluster. Instead render and validate offline and put the exact command in your report for the user. Run one only when the brief quotes the user asking for it AND names the expected `kubectl config current-context`; check it matches first.
2. NEVER put secret values in manifests, `values*.yaml` or ConfigMaps - they are plain text in git and in the cluster. Instead reference an existing Secret (`secretKeyRef`, `envFrom.secretRef`) or the project's tool (External Secrets, Sealed Secrets, SOPS).
3. Pin image tags (or digests); never `latest` - rollbacks and caching need an immutable reference.
4. Every container sets resource `requests` (and a memory `limit`) plus `readinessProbe` and `livenessProbe` that check different things - missing requests break scheduling, and a liveness probe that checks dependencies restarts healthy pods in a cascade.
5. Harden the pod: `runAsNonRoot: true`, `allowPrivilegeEscalation: false`, `readOnlyRootFilesystem: true` where the app allows it, `capabilities: {drop: ["ALL"]}`, and no `privileged`, `hostNetwork` or `hostPath` without a stated reason.
6. NEVER change `spec.selector` of an existing Deployment, StatefulSet or DaemonSet - it is immutable, so the apply fails or forces a delete + recreate with downtime. Keep selector labels stable; add new labels to the pod template only.
7. Keep chart defaults in `values.yaml` working and documented; environment overrides go in `values-<env>.yaml`. Bump `version` in `Chart.yaml` on every chart change.

## Pitfalls Flash models get wrong
- Env var values must be strings: `value: 8080` or `value: true` fails validation. Quote them: `value: "8080"`.
- YAML 1.1 parsers read `yes`, `no`, `on`, `off` as booleans and `0755` as octal. Quote such strings.
- Helm templates: quote user strings (`{{ .Values.name | quote }}`); indent blocks with `{{- toYaml .Values.resources | nindent 12 }}`, and `{{-` trims whitespace, which often breaks indentation. Render after every template edit.
- Removed API versions (for example `extensions/v1beta1`, `policy/v1beta1 PodSecurityPolicy`) fail on current clusters. Match `apiVersion` to the target cluster version.
- A Service `selector` must match the pod template labels exactly, and `targetPort` must match the container port. Otherwise the Service has no endpoints and gives no error.
- Kustomize patches match by kind + name (+ namespace); a typo applies nothing and gives no error. Diff the rendered output.
- Namespaces: resources without `metadata.namespace` land in the current context's namespace. Set it explicitly or via kustomize `namespace:`.

## Example - bad -> good
```yaml
# BAD: floating tag, secret in plain text, numeric env value, no resources/probes
containers:
  - name: api
    image: acme/api:latest
    env:
      - {name: DB_PASSWORD, value: hunter2}
      - {name: PORT, value: 8080}
```
```yaml
# GOOD
containers:
  - name: api
    image: acme/api:1.4.2
    env:
      - name: DB_PASSWORD
        valueFrom: {secretKeyRef: {name: api-db, key: password}}
      - {name: PORT, value: "8080"}
    resources: {requests: {cpu: 100m, memory: 128Mi}, limits: {memory: 256Mi}}
    readinessProbe: {httpGet: {path: /ready, port: 8080}}
    livenessProbe: {httpGet: {path: /healthz, port: 8080}}
    securityContext: {runAsNonRoot: true, allowPrivilegeEscalation: false}
```

## Before finishing
- [ ] Rendered (`helm template` / `kubectl kustomize`) and linted without errors
- [ ] No secrets, no `latest`, selectors unchanged, env values quoted
- [ ] Requests, probes and securityContext present on new containers
- [ ] No cluster-changing command run; the command for the user is in the report
