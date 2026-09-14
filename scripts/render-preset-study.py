"""Render the preset study's tables, figures, and standalone report."""
import base64
import html
import json
import os
from pathlib import Path
import sys

os.environ.setdefault('MPLCONFIGDIR', '/tmp/herdlink-study-matplotlib')
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

out = Path(sys.argv[1] if len(sys.argv) > 1 else 'reports/preset-study').resolve()
meta = json.loads((out / 'metadata.json').read_text())
df = pd.read_json(out / 'results.json')
figdir = out / 'figures'
figdir.mkdir(exist_ok=True)
order = ['open-trade', 'seed-containment', 'delayed-response', 'partner-ring', 'hub-controls', 'temporary-standstill', 'seed-community', 'incoming-pressure', 'community-bridges', 'trade-bottlenecks']
short = dict(zip(order, ['Open', 'Seed', 'Delayed', 'Ring', 'Hubs', 'Pause', 'Community', 'Shield', 'Borders', 'Bottlenecks']))
network = order[-4:]
colors = dict(zip(order, ['#94a3b8', '#2563eb', '#7c3aed', '#e09c24', '#64748b', '#b36894', '#007f83', '#ba4875', '#d46732', '#4267a1']))
plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 10, 'axes.spines.top': False, 'axes.spines.right': False, 'axes.titleweight': 'bold', 'figure.facecolor': 'white', 'axes.facecolor': 'white', 'savefig.facecolor': 'white', 'svg.fonttype': 'none'})
for name, values in {
    'benefit': 100 * df.externalInfectionsAvertedFraction,
    'trade': 100 * df.crossTradeRetained,
    'totalBenefit': 100 * (1 - df.cumulativeInfections / df.baselineCumulativeInfections),
    'peakBenefit': 100 * (1 - df.peakI / df.baselinePeakI),
}.items():
    df[name] = values
primary = df[df.config.eq('weekly-SEIR') & df.experiment.eq('production')].copy()
actual = primary[primary.scale.isin(['broad', 'finer'])]
finer = actual[actual.scale.eq('finer')]
broad = actual[actual.scale.eq('broad')]
assert len(primary) == 40 * 5 * 10, 'The primary matrix must cover every seed, scale, and policy.'
assert not df.duplicated(['config', 'seedRegion', 'scale', 'preset']).any()
assert ((df.trade >= -1e-8) & (df.trade <= 100 + 1e-8)).all()
figures = []

def save(fig, name, title, caption):
    fig.savefig(figdir / (name + '.png'), dpi=160, bbox_inches='tight')
    fig.savefig(figdir / (name + '.svg'), bbox_inches='tight')
    plt.close(fig)
    figures.append((name, title, caption))

def matrix(ax, values, rows, cols, title, cmap='YlGnBu', vmin=0, vmax=100):
    arr = np.array(values, dtype=float)
    im = ax.imshow(arr, aspect='auto', cmap=cmap, vmin=vmin, vmax=vmax)
    ax.set_xticks(range(len(cols)), cols)
    ax.set_yticks(range(len(rows)), rows)
    ax.tick_params(length=0, pad=8)
    ax.set_title(title, loc='left', pad=14)
    for y in range(arr.shape[0]):
        for x in range(arr.shape[1]):
            value = arr[y, x]
            ax.text(x, y, '—' if not np.isfinite(value) else f'{value:.1f}', ha='center', va='center', fontsize=8, color='white' if value > 65 else '#162638')
    return im

case = finer[finer.seedRegion.eq('CR35')].set_index('preset').reindex(order)
fig, axes = plt.subplots(1, 2, figsize=(12, 6.2), sharey=True, layout='constrained')
y = np.arange(len(order))
for ax, field, title in zip(axes, ['benefit', 'trade'], ['Infection events averted outside the seed (%)', 'Interregional trade retained (%)']):
    ax.barh(y, case[field], color=[colors[p] for p in order], height=.66)
    ax.set_xlim(min(-1, case[field].min() - 2), 112)
    ax.set_yticks(y, [short[p] for p in order])
    ax.set_title(title, loc='left', fontsize=11)
    ax.grid(axis='x', alpha=.15); ax.set_axisbelow(True)
    for i, val in enumerate(case[field]): ax.text(max(0, val) + 1, i, f'{val:.2f}', va='center', fontsize=9)
axes[0].invert_yaxis()
fig.suptitle('The current seed: CR35, weekly SEIR, Finer', fontsize=15, weight='bold')
save(fig, '01_current_seed', 'The current seed', 'The four Network policies have distinct effective route restrictions. Seed and Community coincide here: CR35 is a singleton at Finer, and the 3-day and 7-day deadlines reach the same weekly sample. Every percentage compares with this seed’s open-trade trajectory.')

resolutions = sorted(primary.resolution.unique())
groups = primary.groupby('resolution').groupCount.first()
columns = [f'{"Broad" if r == 1 else "Finer" if r == 1.5 else "Research"}\nγ={r:g}\n{groups[r]} groups' for r in resolutions]
fig, axes = plt.subplots(1, 2, figsize=(14, 6.4), layout='constrained')
for ax, field, title in zip(axes, ['benefit', 'trade'], ['Median infection events averted (%)', 'Median interregional trade retained (%)']):
    table = primary.pivot_table(index='preset', columns='resolution', values=field, aggfunc='median').reindex(index=order, columns=resolutions)
    im = matrix(ax, table.values, [short[p] for p in order], columns, title)
fig.colorbar(im, ax=axes, shrink=.7, label='Percent')
fig.suptitle('Changing community scale changes both groups and intervention scope', fontsize=15, weight='bold')
save(fig, '02_scale_comparison', 'Community scales', 'Each cell is the median of 40 paired seed comparisons. Gamma 1 and 1.5 are the application’s Broad and Finer scales. Gamma 1.25, 2, and 3 are research settings. Original policy schedules are independent of community scale.')

fig, axes = plt.subplots(1, 2, figsize=(12.5, 6.7), sharey=True, layout='constrained')
for ax, (scale, data) in zip(axes, [('Broad', broad), ('Finer', finer)]):
    med = data.groupby('preset')[['trade', 'benefit']].median().reindex(order)
    for p in order:
        a = data[data.preset.eq(p)]
        x, yy = med.loc[p]
        xq, yq = a.trade.quantile([.25, .75]).values, a.benefit.quantile([.25, .75]).values
        ax.errorbar(x, yy, xerr=[[max(0, x-xq[0])], [max(0, xq[1]-x)]], yerr=[[max(0, yy-yq[0])], [max(0, yq[1]-yy)]], fmt='o', color=colors[p], capsize=2, elinewidth=1, markersize=7, label=short[p], alpha=.9)
    ax.set_xlim(-3, 103); ax.set_ylim(-3, 103)
    ax.set_xlabel('Interregional trade retained (%) →'); ax.set_title(scale, loc='left')
    ax.grid(alpha=.16)
axes[0].set_ylabel('Infection events averted outside the seed (%) →')
handles, labels = axes[0].get_legend_handles_labels()
fig.legend(handles, labels, loc='outside lower center', ncol=5, frameon=False)
fig.suptitle('Policy value depends on the trade you want to retain', fontsize=15, weight='bold')
save(fig, '03_tradeoff', 'Health and trade together', 'Points show medians; bars show the middle 50% of seed outcomes. These are variations across all 40 seeds. The upper right combines more infection prevention with more trade retained. Decisions below use paired seed outcomes, preserving the relationship between each policy’s cost and benefit.')

seed_order = sorted(finer.seedRegion.unique())
table = finer[finer.preset.isin(network)].pivot(index='seedRegion', columns='preset', values='benefit').reindex(index=seed_order, columns=network)
fig, ax = plt.subplots(figsize=(8, 13.5), layout='constrained')
im = matrix(ax, table.values, seed_order, [short[p] for p in network], 'Starting region changes the result · Finer')
fig.colorbar(im, ax=ax, shrink=.45, label='Infection events averted (%)')
save(fig, '04_seed_variation', 'Variation across all seed regions', 'Each row uses one COROP seed with the same settings and its own open-trade baseline. Strong variation indicates that the location of introduction is a major part of policy choice. The four columns use the applied Network rules, including their scope at Finer.')

sens = df[df.dataset.eq('weekly') & df.experiment.eq('production') & df.scale.isin(['broad', 'finer'])]
configs = [c for c in meta['configs'] if c['suite'] in ['primary', 'sensitivity']]
sens_rows = [(c['id'], s) for c in configs for s in ['broad', 'finer']]
sens_rows = [r for r in sens_rows if ((sens.config == r[0]) & (sens.scale == r[1])).any()]
labels = [f'{c.replace("weekly-", "").replace("movement-", "movement ")} · {s.title()}' for c, s in sens_rows]
values = [sens[sens.config.eq(c) & sens.scale.eq(s)].groupby('preset').benefit.median().reindex(order).values for c,s in sens_rows]
fig, ax = plt.subplots(figsize=(12.5, max(5, len(values)*.45)), layout='constrained')
im = matrix(ax, values, labels, [short[p] for p in order], 'Model and movement sensitivity · median infection events averted (%)')
fig.colorbar(im, ax=ax, shrink=.65, label='Percent')
save(fig, '05_dynamics', 'Model and transmission settings', 'The study changes the model (SEIR, SIR, SIS, SEIRS) and the movement parameter (0.02, 0.08, 0.32), holding the other controls fixed. These are separate parameter scenarios. Cumulative events include reinfections in SIS and SEIRS.')

fig, axes = plt.subplots(1, 2, figsize=(12.5, 5), layout='constrained')
for p, marker, width, size, line in zip(['seed-community', 'incoming-pressure', 'trade-bottlenecks'], ['o', 's', 'D'], [4, 2, 1], [10, 7, 4], ['-', '--', ':']):
    data = primary[primary.preset.eq(p)].groupby('resolution')[['targetCount', 'benefit']].median()
    for ax, field in zip(axes, ['targetCount', 'benefit']): ax.plot(data.index, data[field], marker=marker, linestyle=line, linewidth=width, markersize=size, markerfacecolor='white', color=colors[p], label=short[p])
matched = df[df.experiment.eq('matched-k3')]
for p in ['incoming-pressure', 'trade-bottlenecks']:
    data = matched[matched.preset.eq(p)].groupby('resolution').benefit.median()
    axes[1].plot(data.index, data.values, '--s', color=colors[p], alpha=.8, label=short[p] + ' · fixed k=3')
axes[0].set_ylabel('Median regions restricted'); axes[1].set_ylabel('Median infection events averted (%)')
for ax in axes:
    ax.set_xlabel('Community resolution γ'); ax.set_xticks(resolutions); ax.grid(alpha=.16); ax.legend(fontsize=8, frameon=False)
axes[0].set_title('The automatic target budget', loc='left'); axes[1].set_title('Separating budget from score', loc='left')
save(fig, '06_budget', 'The target budget is part of the scale effect', 'Community size sets the limit for Shield and Bottlenecks. Their underlying rankings are independent of community scale, so a fixed k=3 gives identical target sets at Broad and Finer. Community and Borders also change membership or route boundaries as gamma changes.')

temporal = df[df.dataset.isin(['daily', 'weekly', 'monthly', 'yearly']) & df.config.isin(['daily-SEIR', 'weekly-SEIR', 'monthly-SEIR', 'yearly-SEIR']) & df.scale.isin(['broad', 'finer'])]
rows = [(d,s) for d in ['daily','weekly','monthly','yearly'] for s in ['broad','finer'] if ((temporal.dataset==d)&(temporal.scale==s)).any()]
values = [temporal[temporal.dataset.eq(d)&temporal.scale.eq(s)].groupby('preset').benefit.median().reindex(order).values for d,s in rows]
fig, ax = plt.subplots(figsize=(12.5, 5.8), layout='constrained')
im = matrix(ax, values, [f'{d.title()} · {s.title()}' for d,s in rows], [short[p] for p in order], 'Application resolution sensitivity · median infection events averted (%)')
fig.colorbar(im, ax=ax, shrink=.7, label='Percent')
save(fig, '07_temporal_resolution', 'Temporal resolution changes the model experiment', 'Each recorded date advances one model step. Rates stay fixed while response delays use calendar days, and Ring selects partners from the first bin. Daily percentages summarize 38 seeds with positive outside-seed baseline events; CR21 and CR22 have zero baseline events. Other rows summarize all 40 seeds.')

hashes = finer.pivot(index='seedRegion', columns='preset', values='effectiveRouteHash').reindex(columns=order)
overlap = np.array([[(hashes[a] == hashes[b]).mean()*100 for b in order] for a in order])
fig, ax = plt.subplots(figsize=(10, 8), layout='constrained')
im = matrix(ax, overlap, [short[p] for p in order], [short[p] for p in order], 'How often policies close exactly the same recorded routes · Finer')
plt.setp(ax.get_xticklabels(), rotation=35, ha='right')
fig.colorbar(im, ax=ax, shrink=.65, label='Seeds with identical effective restrictions (%)')
save(fig, '08_equivalence', 'Schedule equivalence is measured directly', 'The comparison hashes each date’s permitted recorded movement routes. Equality means the same effective network restrictions, even when control labels differ. Original timing can converge at weekly samples, and singleton communities can reproduce seed-only control.')

# Paired Pareto comparisons use each seed's actual outcomes.
pareto = []
for (scale, seed), group in actual.groupby(['scale', 'seedRegion']):
    for _, row in group.iterrows():
        competitors = group[(group.trade >= row.trade - 1e-9) & (group.benefit >= row.benefit - 1e-9)]
        dominated = ((competitors.trade > row.trade + 1e-9) | (competitors.benefit > row.benefit + 1e-9)).any()
        pareto.append({'scale':scale, 'seed':seed, 'preset':row.preset, 'efficient':not dominated})
pareto_df = pd.DataFrame(pareto)
choice = []
for threshold in [50, 75, 90, 95]:
    for seed, group in finer.groupby('seedRegion'):
        eligible = group[group.trade >= threshold - 1e-9]
        winner = eligible.sort_values(['benefit', 'trade', 'affectedRegionCount'], ascending=[False,False,True]).iloc[0]
        choice.append({'minimumTradeRetained':threshold, 'seed':seed, 'preset':winner.preset, 'benefit':winner.benefit, 'trade':winner.trade})
choice_df = pd.DataFrame(choice)
summary = actual.groupby(['scale','preset']).agg(medianBenefit=('benefit','median'), q25Benefit=('benefit',lambda x:x.quantile(.25)),q75Benefit=('benefit',lambda x:x.quantile(.75)), medianTotalBenefit=('totalBenefit','median'),medianPeakBenefit=('peakBenefit','median'),medianTradeRetained=('trade','median'),medianTargetCount=('targetCount','median'),medianAffectedRegions=('affectedRegionCount','median'),minBenefit=('benefit','min'),maxBenefit=('benefit','max')).reset_index()
summary = summary.merge(pareto_df.groupby(['scale','preset']).efficient.sum().rename('paretoSeeds'), on=['scale','preset'])
summary.to_csv(out/'policy-summary.csv',index=False)
choice_df.to_csv(out/'trade-budget-choices.csv',index=False)
pd.DataFrame(overlap,index=order,columns=order).to_csv(out/'schedule-equivalence.csv')

md, ht = [], []
def heading(level, text):
    md.append('#'*level+' '+text+'\n'); ht.append(f'<h{level}>{html.escape(text)}</h{level}>')
def paragraph(text):
    md.append(text+'\n'); ht.append('<p>'+html.escape(text)+'</p>')
def table(data):
    show = data.copy().fillna('—')
    headers = [str(c) for c in show.columns]
    md.append('| '+' | '.join(headers)+' |\n| '+' | '.join(['---']*len(headers))+' |\n'+'\n'.join('| '+' | '.join(map(str,row))+' |' for row in show.values)+'\n')
    ht.append(show.to_html(index=False,border=0,escape=True))
def figure(index):
    name,title,caption = figures[index]
    md.append(f'![{title}](figures/{name}.png)\n\n{caption}\n')
    image = base64.b64encode((figdir/(name+'.png')).read_bytes()).decode()
    ht.append(f'<figure><img src="data:image/png;base64,{image}" alt="{html.escape(title)}"><figcaption>{html.escape(caption)}</figcaption></figure>')
def link(label, target):
    md.append(f'[{label}]({target})\n'); ht.append(f'<p><a href="{html.escape(target)}">{html.escape(label)}</a></p>')

heading(1,'Which preset works best?')
paragraph('HerdLink policy comparison · all 40 COROP seeds · five community scales · four compartment models')
heading(2,'Findings')
sf = summary[summary.scale.eq('finer')].set_index('preset')
sb = summary[summary.scale.eq('broad')].set_index('preset')
ring, community, shield, border, bottleneck = [sf.loc[p] for p in ['partner-ring',*network]]
paragraph(f'Under the primary weekly SEIR settings, Partner ring prevents a median {ring.medianBenefit:.1f}% of infection events outside the seed while retaining {ring.medianTradeRetained:.1f}% of interregional trade. This makes it a strong reference for substantial containment. Its scope follows the seed’s first-step trading partners, so outcomes and costs vary across seeds.')
paragraph(f'At Finer, the four Network policies cover distinct choices: Community prevents a median {community.medianBenefit:.1f}% and retains {community.medianTradeRetained:.1f}% of trade; Shield {shield.medianBenefit:.1f}% and {shield.medianTradeRetained:.1f}%; Borders {border.medianBenefit:.1f}% and {border.medianTradeRetained:.1f}%; Bottlenecks {bottleneck.medianBenefit:.1f}% and {bottleneck.medianTradeRetained:.1f}%. Policy choice depends on the trade footprint a decision-maker accepts.')
paragraph('Community scale changes intervention scope as well as structure. The median seed-community size is 30 at Broad and 8 at Finer. Shield and Bottlenecks inherit that limit. Fixed-budget comparisons below isolate this budget effect. Borders becomes more restrictive as more intercommunity routes are identified; its national footprint is evaluated explicitly.')
paragraph('The Network group contains four mechanisms: seed-community exports, import shielding, national community borders, and bottleneck exports. All four have different effective restrictions in each of the 200 primary seed-and-scale combinations. Community coincides with Seed in 11 of those combinations: a singleton seed community and the recorded response date make their controls identical.')

heading(2,'1. What each preset changes')
policies = [
['Open','All routes available','Immediate','Entire period'],['Seed','Seed exports','3 days','Through end'],['Delayed','Seed exports','Seed entry prevalence ≥5%, then 14 days','Through end'],['Ring','Seed and first-step partners: exports','7 days','Through end'],['Hubs','Top three full-period exporters: exports','7 days','Through end'],['Pause','All regional exports','7 days','Model-derived cycle'],['Community','Every seed-community member: exports','7 days','Through end'],['Shield','Highest original incoming pressure: imports','7 days','Through end'],['Borders','All routes crossing community boundaries','7 days','Through end'],['Bottlenecks','Highest weighted betweenness: exports','7 days','Through end']]
table(pd.DataFrame(policies,columns=['Preset','Action','Response','Duration']))
paragraph('Community membership comes from the unrestricted full-period graph at the chosen scale. Shield and Bottlenecks select up to the seed-community size among positive scores. Borders applies nationally. Each policy replaces the complete intervention schedule and retains local trade and local contact transmission. Original policies vary in timing and duration; the four Network policies share a seven-day response and persistent duration.')
figure(0)

heading(2,'2. How the study was run')
paragraph(f'The full matrix contains {len(df):,} policy cases. Every setting enumerates the 40 COROP seed regions, one at a time, at 1% initial infection in the seed. The primary comparison uses weekly SEIR with local transmission 0.32, movement transmission 0.08, latency 0.22, and recovery 0.15 per recorded step. The primary matrix contains 2,000 cases: 40 seeds × five scales × ten policies.')
config_rows=[]
for config in meta['configs']:
    rows=df[df.config.eq(config['id'])]
    if len(rows): config_rows.append([config['id'],len(rows),rows.seedRegion.nunique(),', '.join(f'{r:g}' for r in sorted(rows.resolution.unique()))])
table(pd.DataFrame(config_rows,columns=['Configuration','Cases','Seeds','Gamma values']))
paragraph('The application scales are Broad (γ=1) and Finer (γ=1.5). Research values γ=1.25, 2, and 3 explore additional partitions without changing the application selector. Their group counts are 8, 11, and 15; Broad and Finer have 3 and 8 groups. Local recorded trade contributes to community detection, while restrictions and trade-cost comparisons focus on interregional movements.')
paragraph('The 8,400 production policy cases use the production preset loader. The 240 fixed-k cases construct schedules from the production rankings with a three-region limit. All cases use the production simulation. The headless harness represents UI callbacks, caches the original trajectory for each seed/settings pair, and reuses a result only when its full settings and schedule are identical. It records source hashes and dataset hashes. Schedules, direction controls, temporal boundaries, and population conservation are checked during the run. SEIRS uses the application’s waning rate of 0.02 per recorded step.')
paragraph('The main benefit measure is the fraction of new infection events outside the seed that are averted relative to the same seed’s open baseline. Total infection-event reduction and peak infectious burden are also reported. Initial seed infections are excluded from cumulative new events. SIS and SEIRS count reinfections again. Trade retained counts animal movement events, which can include repeated movements of the same animal. The model’s regional holdings are estimated model populations.')
paragraph('Medians and quartiles summarize variation across all 40 seeds. A median describes the typical seeded case; a pooled total gives more weight to larger epidemics. For example, Seed containment averts a median 0.59% of outside-seed infection events, while its reduction across pooled seed totals is 17.02%. The five scales revisit the same 40 deterministic seeded cases. Each point in the trade-off figure combines two separate medians; paired comparisons below retain each seed’s actual cost and benefit. The study uses the full recorded period for structural selection, and Shield also uses the full original simulation; this is retrospective planning with that information available.')

heading(2,'3. Community scale, outcomes, and trade')
figure(1); figure(2)
t=sf.reindex(order)
table(pd.DataFrame({'Preset':[short[p] for p in order],'Outside-seed events averted (%)':t.medianBenefit.round(2).values,'Total events averted (%)':t.medianTotalBenefit.round(2).values,'Peak burden reduced (%)':t.medianPeakBenefit.round(2).values,'Cross-trade retained (%)':t.medianTradeRetained.round(2).values,'Pareto-efficient seeds /40':t.paretoSeeds.values}))
paragraph('The table reports the Finer scale. Pareto-efficient means that, for that seed, no other preset both retains at least as much trade and averts at least as many outside-seed infection events, with a strict improvement in one measure. Tied policies can both be efficient. This paired calculation complements the median points in the figure.')
paragraph('Within weekly SEIR at Finer, Ring improves at least one of those two outcomes while matching or improving the other in 35 of 40 comparisons with Borders, 32 with Shield, and 25 with Bottlenecks. Community belongs to the efficient set for 31 seeds and Bottlenecks for 15. These counts compare the complete policy actions and their trade footprints.')
heading(3,'Decision examples')
choice_rows=[]
for threshold,g in choice_df.groupby('minimumTradeRetained'):
    winners=g.preset.value_counts()
    choice_rows.append([f'{threshold}%', '; '.join(f'{short[p]} {n}/40' for p,n in winners.items()),f'{g.benefit.median():.2f}%',f'{g.trade.median():.2f}%'])
table(pd.DataFrame(choice_rows,columns=['Minimum cross-trade retained','Best policy by seed','Median prevention of selected policy','Median trade retained']))
paragraph('These examples maximize prevention subject to a specified minimum trade retention. Ties prefer more retained trade, then fewer affected regions. They make the preference explicit; a different trade threshold or objective, such as peak burden, can select a different policy. Policy selection uses the simulated outcomes for each seed and is a descriptive comparison of this matrix.')

heading(2,'4. Starting location and target budget')
figure(3); figure(5)
paragraph(f'At Broad, Shield targets a median {sb.loc["incoming-pressure","medianTargetCount"]:.0f} regions and retains only {sb.loc["incoming-pressure","medianTradeRetained"]:.2f}% of interregional trade. At Finer it targets a median {shield.medianTargetCount:.0f} and retains {shield.medianTradeRetained:.2f}%. Changes of this size reflect the target budget as well as the partition. A large group can create a near-national import restriction.')
paragraph('The fixed k=3 experiment compares import shielding and bottleneck exports using the same region limit at Broad and Finer. Their score definitions use the original trajectory or aggregate graph, independent of community labels. Matching k therefore fixes their target sets across the two scales. Community selection retains its whole-group definition, and Borders retains national zoning.')
if len(matched):
    t=matched[matched.scale.eq('finer')].groupby('preset')[['benefit','trade','targetCount']].median().reindex(['incoming-pressure','trade-bottlenecks'])
    table(pd.DataFrame({'Fixed k=3 policy':[short[p] for p in t.index],'Events averted (%)':t.benefit.round(2).values,'Trade retained (%)':t.trade.round(2).values,'Actual targets':t.targetCount.values}))
    peak=matched[matched.scale.eq('finer')].groupby('preset').peakBenefit.median()
    paragraph(f'An objective based on peak burden gives a different emphasis: fixed-k Bottlenecks reduces peak infectious burden by a median {peak["trade-bottlenecks"]:.2f}%, compared with {peak["incoming-pressure"]:.2f}% for Shield. Shield has the larger reduction in cumulative events. The same three-region limit also removes different amounts of trade.')

heading(2,'5. Sensitivity to disease settings and temporal resolution')
figure(4)
paragraph('Ring’s median prevention across the weekly model and movement settings spans 80.61–81.71%. Bottlenecks is more sensitive to those assumptions: at Finer its median prevention ranges from 2.2% in SIR to 29.0% in SEIRS. These results describe the settings tested; each model changes the duration and recurrence of transmission opportunities.')
figure(6)
paragraph('Each temporal bin advances the compartment model once. The same recovery value therefore acts once per daily, weekly, monthly, or yearly sample. Response delays use calendar days and start at the next available sample. Cross-resolution differences combine epidemic timing, observation horizon in steps, and movement aggregation; the within-resolution comparisons show the policy behavior at that application setting.')
paragraph('Ring’s targets also change with the first recorded bin: median target counts are 1 for daily data, 9 for weekly, 15.5 for monthly, and 23.5 for yearly. Its daily median prevention is 0.030%, compared with 80.77% weekly. A common historical contact window would give a consistent target definition across resolutions. Daily CR21 and CR22 have zero outside-seed baseline events; their absolute outcomes remain in the data, and percentage summaries use the 38 seeds with positive denominators. Trade summaries include all 40 seeds.')
paragraph('Temporary standstill reopens after the ceiling of the infectious duration, plus the latent duration for SEIR/SEIRS, measured in recorded steps. A finite pause can leave local infections that resume movement-mediated spread after reopening. Comparisons of peak burden and cumulative events show different aspects of that timing. A calendar-based epidemic study would define rates and intervention duration on a common time axis before comparing aggregation levels.')
paragraph('For weekly SEIR, Pause averts a median 0.50% of outside-seed events and retains 92.80% of interregional trade. Seed containment averts 0.59% and retains 99.25%, improving both measures in 18 of 40 paired cases. The four yearly samples end before Pause’s reopening date, so its yearly result represents persistent control over that observation period.')

heading(2,'6. Equivalent schedules and practical insights')
figure(7)
paragraph('Matching control names to mechanisms matters. Export containment limits onward movement, import shielding limits arrivals, and community zoning preserves internal movement while separating groups. Rankings can select the same region, and recording both their action and effective routes reveals when they produce the same experiment.')
paragraph('The results support three practical next steps: use Ring as a substantive containment comparator, use Seed as a focused low-trade-cost comparator, and present Community, Shield, Borders, and Bottlenecks as policies with distinct scopes. Show the selected region count or border-route count in the existing information cards and compare retained trade alongside outcomes. Seed-region sensitivity is substantial, so assess a policy across plausible introduction locations.')
paragraph('Finer community mapping improves structural detail, while policy intensity follows the chosen intervention rule. For ranking-based controls, an explicit region or trade budget would let users explore that intensity independently of community scale. The fixed-budget experiment supplies a concrete basis for that product decision.')

heading(2,'7. Bug checks, performance, and validation')
paragraph('The review corrected floating-point shortest-path ties in weighted betweenness. Exact binary-rational weights are mapped to shared BigInt distance units, so mathematically equal inverse-volume paths share credit. Near-equal paths remain distinct. Bundled aggregate rankings were unchanged by the correction; the regression test demonstrates the error on a three-node equal-path example.')
paragraph('The preset switch is on the right and uses icons with accessible labels. Four Network policies cover distinct restriction mechanisms. Tests cover import/export direction, dated border closures, internal and local trade, seven-day boundaries, independent saved schedules, scale-aware active badges, and zero-score cases.')
validation_path = out/'validation.json'
if validation_path.exists():
    validation = json.loads(validation_path.read_text())
    paragraph(f'The final verification passed {validation["testsPassed"]} tests, the production build, and the whitespace check. Browser checks covered switching groups, applying import shielding and border schedules, keyboard access to dated route details, and restoring the open baseline. The browser console contained zero errors during these checks.')
    paragraph('Timeline tooltips mount their route details on interaction and show one selected date at a time. All date choices remain available. The measured weekly Borders view contains 4,597 DOM elements with tooltips closed; eager rendering contained 113,287. Opening the first date exposes all 210 route details. The daily Borders view contains 6,617 elements with tooltips closed.')
    table(pd.DataFrame(validation['browserLoads']))
    paragraph('These browser values are individual observed loads from button click until controls were enabled, including tool communication, scenario application, timeline metrics, and React rendering. They are interaction checks on the local development server. Dataset parsing had already completed.')
profile_path = out/'performance.json'
if profile_path.exists():
    profile = json.loads(profile_path.read_text())
    table(pd.DataFrame([{'Dataset':r['dataset'].title(), 'Cold graph (ms)':r['coldGraph']['medianMs'], 'First bottleneck (ms)':r['firstBottleneck']['medianMs'], 'First Shield (ms)':r['firstPressure']['medianMs'], 'Cached Shield (ms)':r['cachedPressure']['medianMs'], 'Four cached selections (ms)':r['cachedSelections']['medianMs']} for r in profile['datasets']]))
    paragraph(f'Helper timings are medians from {profile["rounds"]} fresh runs and {profile["cachedRounds"]} cached runs on {profile["cpu"]}, Node {profile["node"]}. The cold graph includes aggregation and both partitions. First Shield includes its original simulation. These measurements isolate calculations; complete interaction timings are shown separately above. The profile JSON includes the full scope and 95th percentiles.')
paragraph(f'The study evaluated {meta["invariants"]["trajectories"]:,} unique trajectories and checked {meta["invariants"]["nodeFrames"]:,} node frames. The largest observed compartment conservation difference was {meta["invariants"]["maxMassError"]:.3g} model units. It reused {meta["invariants"]["exactScheduleReuses"]:,} exact schedule results. Wall time was {meta.get("wallSeconds",0):.1f} seconds on {meta["cpu"]}, Node {meta["node"]}. Runtime SHA-256: {meta["sourceHashes"]["runtime"]}.')

heading(2,'8. Reproduce and inspect')
paragraph('Run node scripts/evaluate-scenario-presets.js reports/preset-study, then python scripts/render-preset-study.py reports/preset-study. Figure rendering uses NumPy, pandas, and Matplotlib. The raw data and summaries below support further analysis. Each figure is also available as a standalone PNG and editable SVG.')
for label, target in [('All case results (CSV)','results.csv'),('Study settings and source hashes','metadata.json'),('Policy summaries','policy-summary.csv'),('Trade-budget choices by seed','trade-budget-choices.csv'),('Schedule equivalence matrix','schedule-equivalence.csv')]: link(label,target)
for label, target in [('Calculation performance','performance.json'),('Final verification','validation.json')]:
    if (out/target).exists(): link(label,target)
heading(2,'References and interpretation')
paragraph('Animal-trade research supports comparing several targeting measures and preserving chronology when evaluating transmission. These papers motivate the experiment design; the policy performance reported here is calculated from HerdLink’s bundled data and model settings.')
for label,url in [('Büttner et al. (2013): targeted centrality controls in an animal trade network','https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0074292'),('Lentz et al. (2016): static and temporal pig-trade networks','https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0155196'),('Gorsich et al. (2016): community structure in cattle shipment networks','https://doi.org/10.1016/j.prevetmed.2016.09.023'),('Brandes (2001): weighted betweenness algorithm','https://doi.org/10.1080/0022250X.2001.9990249')]:link(label,url)

(out/'report.md').write_text('\n'.join(md))
style='''body{margin:0;background:#f2f5f8;color:#1c2d40;font:16px/1.65 system-ui,sans-serif}main{max-width:1150px;margin:32px auto;padding:45px;background:white;border-radius:12px}h1{font-size:42px;line-height:1.1;color:#006c73}h2{margin-top:46px;border-top:1px solid #d9e3e9;padding-top:24px;color:#006c73}h3{margin-top:28px}p{max-width:100ch}table{width:100%;border-collapse:collapse;font-size:13px;margin:24px 0}th,td{border-bottom:1px solid #d9e3e9;padding:10px;text-align:left}th{background:#eef6f6}figure{margin:35px 0}img{width:100%;height:auto}figcaption{font-size:14px;color:#516477;padding:12px 8px}a{color:#007b84} @media print{body{background:white}main{margin:0;padding:0}h2{break-after:avoid}figure{break-inside:avoid}table{font-size:10px}}'''
(out/'report.html').write_text('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>HerdLink preset comparison</title><style>'+style+'</style><main>'+''.join(ht)+'</main></html>')
print(json.dumps({'report':str(out/'report.html'),'figures':len(figures),'cases':len(df)},indent=2))
