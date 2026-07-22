/**
 * DEPRECATED — import from `@/lib/documents` instead.
 *
 * This module used to hold three hand-rolled renderers (audit report, audit deck, proposal), each
 * carrying its own hex codes and font stacks. They have been replaced by the WOBBLE design system
 * (`src/lib/design-system/*`) plus the composer in `src/lib/documents/index.ts`.
 *
 * The re-exports below exist ONLY so any caller that still points at this path keeps compiling and
 * keeps producing the same-shaped output. New code must not import from here.
 */

export {
  renderAuditDeckHtml,
  renderAuditReportHtml,
  renderProposalHtml,
  type AuditReportShape,
  type ProposalShape,
} from "./index";
