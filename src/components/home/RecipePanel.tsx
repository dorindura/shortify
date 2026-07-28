import type { LocalJobGoal, SavedRecipe } from "./home.types";

type Props = {
  goal: LocalJobGoal;
  summary: string;
  ctaLabel: string;
  canGenerate: boolean;
  loading: boolean;
  onGenerate: () => void;

  paywallMessage: string | null;
  showUpgrade: boolean;
  startCheckout: () => Promise<void>;

  savedRecipes: SavedRecipe[];
  onSaveRecipe: () => void;
  onApplyRecipe: (recipe: SavedRecipe) => void;
  onDeleteRecipe: (id: string) => void;
};

const CTA_CLASS: Record<LocalJobGoal, string> = {
  shorts: "from-sky-500 to-cyan-400 shadow-sky-500/40",
  quote_reel: "from-fuchsia-500 to-fuchsia-400 shadow-fuchsia-500/40",
  multi_source_edit: "from-cyan-500 to-sky-400 shadow-cyan-500/30",
  summary: "from-emerald-500 to-teal-400 shadow-emerald-500/30",
};

const BORDER_CLASS: Record<LocalJobGoal, string> = {
  shorts: "border-sky-500/30",
  quote_reel: "border-fuchsia-500/30",
  multi_source_edit: "border-cyan-500/30",
  summary: "border-emerald-500/30",
};

const DOT_CLASS: Record<LocalJobGoal, string> = {
  shorts: "bg-sky-400",
  quote_reel: "bg-fuchsia-400",
  multi_source_edit: "bg-cyan-400",
  summary: "bg-emerald-400",
};

export default function RecipePanel({
  goal,
  summary,
  ctaLabel,
  canGenerate,
  loading,
  onGenerate,
  paywallMessage,
  showUpgrade,
  startCheckout,
  savedRecipes,
  onSaveRecipe,
  onApplyRecipe,
  onDeleteRecipe,
}: Props) {
  return (
    <section
      className={`space-y-3 rounded-2xl border bg-slate-950/70 p-4 shadow-xl shadow-black/40 backdrop-blur-md ${BORDER_CLASS[goal]}`}
    >
      <div>
        <div className="text-[10px] font-semibold tracking-[0.16em] text-slate-500 uppercase">
          Your recipe
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-slate-200">{summary}</p>
      </div>

      {paywallMessage && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-[11px] text-amber-200">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-semibold">Limit reached</div>
              <div className="mt-0.5 text-amber-200/90">{paywallMessage}</div>
            </div>
            {showUpgrade && (
              <button
                type="button"
                onClick={startCheckout}
                className="shrink-0 rounded-full bg-amber-400 px-3 py-1 text-[10px] font-semibold text-slate-950 shadow hover:brightness-110"
              >
                Upgrade
              </button>
            )}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={onGenerate}
        disabled={loading || !canGenerate}
        className={`w-full rounded-xl bg-gradient-to-r px-4 py-3 text-sm font-bold text-slate-950 shadow-lg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 ${CTA_CLASS[goal]}`}
      >
        {loading ? "Working…" : ctaLabel}
      </button>

      <button
        type="button"
        onClick={onSaveRecipe}
        className="w-full rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-2 text-[12px] font-medium text-slate-400 transition hover:border-slate-600 hover:text-slate-200"
      >
        ☆ Save current settings as a recipe
      </button>

      {savedRecipes.length > 0 && (
        <div className="pt-1">
          <div className="mb-2 text-[10px] font-semibold tracking-[0.16em] text-slate-500 uppercase">
            Saved recipes · one-click reuse
          </div>
          <div className="flex flex-wrap gap-1.5">
            {savedRecipes.map((recipe) => (
              <span
                key={recipe.id}
                className="group inline-flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-950/70 py-1 pr-1 pl-2.5 text-[11px] text-slate-300"
              >
                <button
                  type="button"
                  onClick={() => onApplyRecipe(recipe)}
                  className="inline-flex items-center gap-1.5 hover:text-slate-100"
                  title="Apply this recipe"
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${DOT_CLASS[recipe.goal]}`} />
                  {recipe.name}
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteRecipe(recipe.id)}
                  className="rounded-full px-1 text-slate-600 hover:text-rose-300"
                  title="Delete recipe"
                  aria-label={`Delete recipe ${recipe.name}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
