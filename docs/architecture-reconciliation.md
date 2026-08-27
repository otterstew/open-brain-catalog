# Reconciling the build guide with the reference architecture

I wrote the build guide without having read *Microsoft 365 Copilot Agent Design
Architecture* (v1.0, 20 August 2026). This reconciles the two.

**Short version: they do not conflict, because they are at different altitudes.**
The architecture governs agents across an organisation. The build guide builds
one archive for one person. But there are three real tensions worth naming, one
credit I owe the architecture, and two things it predates.

---

## 1. What each document is for

| | Reference architecture | Build guide |
|---|---|---|
| Question | How should this organisation design, locate, govern and operate Copilot agents? | How do I build a working capture-and-retrieve archive for myself in four evenings? |
| Scope | Seven proposed agents, Dev/UAT/Prod environments, governance registers | One list, four flows, one grounded agent |
| Audience | Whoever owns AI architecture | Me, on a Tuesday night |
| Status | Proposed reference architecture | Instructions |

The build guide is not a small version of the architecture. It is a different
object: the architecture is about **agents that act**, the guide is about **an
archive that answers**. They meet at the point where the archive becomes a
knowledge source an agent grounds on — which is exactly step 4.1 of the guide.

---

## 2. The three real tensions

### Environment: the default one

The architecture says plainly:

> Avoid building an operational production agent directly inside the default
> Power Platform environment without agreed ownership and governance.

The build guide has you doing precisely that. **This is a genuine tension and
the resolution is scope, not a caveat.** The demo is not an operational
production agent; it is one person's experiment with no dependants. The moment
anyone else relies on it, the architecture's rule applies and it moves into a
governed environment inside a solution.

Worth saying out loud when you demo it: *"this deliberately sits below the
threshold in the architecture I wrote — here is where it would move to."* That
is a much stronger position than being caught building in the default
environment by someone who has read your own document.

### Planner and Dataverse

The architecture puts durable state in SharePoint Lists **or Dataverse**, and
resulting actions in **Planner**. The build guide steers away from both.

Not a contradiction — a different problem. The architecture's agents generate
*project work*, which is what Planner is for. The archive's task layer needs
defer dates, a dropped status and free-text recurrence, none of which Planner
holds. Dataverse is avoided in the guide purely because it is premium licensing
that a demo should not need.

Both positions are right for their own scope. Say so rather than letting the two
documents look inconsistent.

### Copilot Studio as the agent factory

The architecture is unambiguous: agents are built and governed in Copilot
Studio, published to channels, republished on change. The guide uses the simpler
SharePoint-grounded agent.

Again scope — but this one has a real migration path, and the guide should say
so: the demo agent is a throwaway. If it proves useful, it is rebuilt in Copilot
Studio, not promoted.

---

## 3. The credit I owe

I presented the billing trap in the Life Engine note — that event triggers are
billable, so silence stops being free — as a finding. **It is already in the
architecture, written a fortnight earlier:**

> Trigger activity contributes to agent consumption and should therefore be
> designed carefully.

The deterministic gate is a *mechanism* for that principle rather than a
discovery of it. The Life Engine note has been corrected to say so.

---

## 4. What the architecture has that the other documents should adopt

Three things in it are better than anything I wrote, and two of them are
directly reusable.

**The memory taxonomy.** Five distinct kinds of memory — personal Copilot
Memory, agent instructions, business knowledge, operational memory, run history
— with the rule that each belongs somewhere different. My vectors note draws one
distinction (meaning versus entity) where this draws five, and the five are more
useful operationally. Anything I said about "memory" should be read through it.

**The layered context model.** Six layers from always-available instructions
down to an audit archive that is retained but never routinely loaded. This is
the discipline that stops context bloat, and the build guide has no equivalent
because at one user it does not need one.

**Knowledge is not instructions.** This is a security point I missed entirely:

> Knowledge should not contain hidden behavioural instructions.

Knowledge documents are retrieved content, not trusted maker-authored
instruction. Anything captured into the archive that an agent later grounds on
is untrusted text — which matters the moment captures come from email, where
anyone can send you anything. The build guide should carry this and now does.

---

## 5. Two things the architecture predates

Both postdate 20 August and are worth folding into v1.1.

**The Copilot Retrieval API.** A Graph REST endpoint that queries the tenant
semantic index and returns ranked chunks with sources, callable from a flow.
The architecture's knowledge section assumes knowledge is reached *through* an
agent; this allows a flow to reach it directly, which changes what the
orchestration layer can do without an agent in the loop.

**The 20,000-item ceiling** on a SharePoint list used as agent knowledge, and
that it must be a single list. The architecture's information architecture
proposes several registers per project site; any one of them used as agent
knowledge inherits that cap. Not a problem at project scale, but it constrains
the "connect the agent to the whole estate" pattern the architecture already
warns against for other reasons.

---

## 6. What I would change in the architecture

One substantive suggestion, offered as a reader rather than an author.

The architecture is comprehensive about **agents that act on records** and
largely silent on **where the reasoning behind those records comes from**. Its
knowledge layer lists policies, requirements, decisions and templates — all
artefacts. The Requirements Quality Agent can assess a requirement against a
standard; it cannot tell you why the standard says what it says, because nobody
wrote that down.

That is the same gap the sponsor argument rests on, and the archive is the thing
that fills it. If v1.1 wanted one addition, it would be a knowledge category for
captured reasoning — distinct from approved documents, lower ceremony, and the
input the agents are otherwise missing.
