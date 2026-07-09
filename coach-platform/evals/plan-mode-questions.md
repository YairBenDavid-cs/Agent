# Plan Mode — Eval Questions (200+)

**Mode contract:** Full write authority. Captures preferences and fires pipelines when a change touches the current week. BLACK signals (explicit orders) are written eagerly (`confidence='explicit'`); GRAY signals get a clarifying question before commit, or are demoted to `inferred` (batched, never fire). Mutating results surface an **approval card** the user must accept/reject. Safety tags (injury/illness) always fire an immediate SAFETY_REPLAN. Constraint-breaching current-week edits should trigger a confirmation pushback (e.g. *"That would put you over your locked 40 km for the week — want me to rebuild the week around it?"*). Plan mode also drives the **program-build flow** (targets → draft sessions → slot placement).

**What we're evaluating per question:** correct lane (WHITE/BLACK/GRAY), correct preference capture + confidence, correct pipeline firing (or none), approval-card surfacing, constraint pushback, and build-flow phase handling.

---

## A. Explicit orders — remove / drop sessions (BLACK)

1. Drop Friday's session.
2. Remove tomorrow's run.
3. Cancel Thursday's workout.
4. Delete the Wednesday strength session.
5. Take out my Saturday long run this week.
6. Skip today's session, I don't want it.
7. Remove the second session on Tuesday.
8. Cut the recovery run this week.
9. Drop both hard sessions this week.
10. Get rid of Monday's workout.
11. Remove all strength sessions from this week.
12. Cancel the rest of this week's plan.
13. Take out the interval session, I'm not feeling it.
14. Drop the tempo run from next week.
15. Delete every session after Thursday.

## B. Explicit orders — exercise content changes (BLACK)

16. Remove burpees from next week.
17. Take box jumps out of my strength sessions.
18. Swap the burpees on Thursday for mountain climbers.
19. Replace lunges with step-ups everywhere.
20. Add pull-ups to my Monday session.
21. Get rid of all plyometrics in my plan.
22. Swap back squats for front squats this block.
23. Take out overhead press, my shoulder's cranky.
24. Add core work to the end of every run day.
25. Replace the hill repeats with flat intervals.
26. Remove Romanian deadlifts from Wednesday.
27. Put kettlebell swings into my next strength day.
28. Change my long run to a trail run this week.
29. Swap Tuesday's intervals for a fartlek.
30. Drop the strides from my easy runs.

## C. Volume caps / limits (BLACK, may breach constraints)

31. Cap my runs at 25 km.
32. Don't let any single run go over 15 km.
33. Max my weekly volume at 40 km.
34. Keep my long run under 20 km from now on.
35. I want to cut weekly volume by 20%.
36. Limit my total weekly running to 30 km.
37. No run longer than 90 minutes, ever.
38. Reduce this week's volume, I'm beat.
39. Cap my strength load at what I did last week.
40. Don't schedule more than 50 km in a peak week.
41. Keep next week easy — half the usual volume.
42. Set a hard ceiling of 45 km per week.
43. I want a lighter week, cut it to 3 runs.
44. Bring my weekly km down to a maintenance level.
45. Don't exceed 4 sessions in any week going forward.

## D. Duration / time caps (BLACK)

46. Max 45 minutes per session.
47. Keep my weekday runs under an hour.
48. No session longer than 75 minutes.
49. I only have 30 minutes on Wednesdays now.
50. Cap strength sessions at 40 minutes.
51. Shorten today's session to 30 minutes.
52. Limit my long run to 2 hours max.
53. I want quick sessions this week, 40 min tops.
54. Keep tempo runs to 50 minutes.
55. My lunch workouts can only be 35 minutes.

## E. Session-count / frequency changes (BLACK)

56. I only want to train 4 days a week now.
57. Add a fifth session to my week.
58. Cut me down to 3 runs a week.
59. I want two strength sessions per week.
60. Drop one session per week going forward.
61. Bump me up to 6 sessions in build weeks.
62. Keep it to 3 sessions this week, I'm traveling.
63. I want to run every day except Sunday.
64. Reduce to one long run and two easy runs weekly.
65. Add a recovery spin on my rest days.

## F. Goal changes (BLACK, major)

66. My new goal is a half-marathon instead of a 10K.
67. I want to train for a marathon now.
68. Change my target to a sub-50 10K.
69. I'm switching from running to strength for a bit.
70. My race got moved up two weeks — adjust the plan.
71. New goal: squat 1.5x bodyweight.
72. I want to focus on speed instead of endurance.
73. Change my race date to October 12th.
74. I'm doing a 5K now, not a 10K.
75. My goal is now body recomposition, not a race.
76. I want to add a strength goal alongside my running.
77. Push my target race back a month.
78. I want to peak for a trail ultra instead.
79. Switch my discipline to powerlifting.
80. My new priority is injury-proofing, not PRs.

## G. Injury / illness / safety (BLACK — always fires SAFETY_REPLAN)

81. I hurt my knee — avoid leg day this week.
82. I'm sick, cancel all hard sessions this week.
83. My calf is tight, take out the hill repeats.
84. I tweaked my back, no deadlifts for now.
85. I've got a cold — make this week easy.
86. My ankle is sore, no running for a few days.
87. I strained my hamstring, adjust the plan.
88. Feeling flu-ish, pull the intensity way down.
89. My shoulder hurts, remove all pressing.
90. I rolled my ankle yesterday, replan around it.
91. I have shin splints, cut the running volume.
92. Doctor said no impact for a week — adjust.
93. My knee is acting up again, avoid squats and lunges.
94. I'm exhausted and might be overtrained, back it off.
95. Chest infection — no hard cardio this week.

## H. Soft signals — likes / dislikes (GRAY → clarifying question)

96. I don't like burpees.
97. I'm not a fan of tempo runs.
98. I hate early morning workouts.
99. Long runs are getting boring.
100. I don't really enjoy interval sessions.
101. Strength days feel like a slog lately.
102. I'd rather not do hill work.
103. I'm over doing box jumps.
104. Treadmill runs are killing me.
105. I don't love how much running I'm doing.
106. Split squats are my least favorite.
107. I prefer outdoor runs to the gym.
108. I'm not enjoying the plan much right now.
109. Recovery runs feel pointless to me.
110. I wish there were more variety.

## I. Soft signals — fatigue / feel (GRAY → clarifying question)

111. Last Tuesday's workout felt really hard.
112. I've been feeling tired lately.
113. My legs are heavy this week.
114. That long run wrecked me.
115. I'm struggling to keep up with the plan.
116. Everything feels harder than it should.
117. I didn't recover well from Saturday.
118. My motivation is low right now.
119. The last few sessions felt too intense.
120. I'm sore all the time these days.
121. I felt great on today's run, honestly.
122. This week felt way easier than last.
123. I could probably handle more volume.
124. That tempo felt slower than it should have.
125. I bonked halfway through the long run.

## J. Scheduling preference edits (BLACK / GRAY depending on phrasing)

126. Move my long run to Sunday.
127. I'd prefer to train in the mornings.
128. Shift Thursday's session to Friday.
129. Tuesday mornings work better for me now.
130. Reschedule everything to evenings this week.
131. Can we move the hard sessions off Mondays?
132. I want my rest day on Wednesday, not Sunday.
133. Push today's workout to tomorrow.
134. Spread my sessions out more, no back-to-backs.
135. I'm only free weekends for long sessions now.
136. Swap my Monday and Thursday sessions.
137. Move strength to after my easy runs.
138. I need Fridays off going forward.
139. Can my long run be Saturday instead of Sunday?
140. Shift my whole week one day later, I'm traveling Monday.

## K. Constraint-breaching edits (must trigger confirmation pushback)

141. Add a 30 km run this week. *(may breach locked weekly volume)*
142. Throw in an extra hard session this week. *(may breach session budget)*
143. Bump my long run to 35 km this weekend.
144. Add two more sessions on top of what's planned.
145. Make every run this week a hard effort.
146. Double my volume next week.
147. Add a second long run this week.
148. Put a max-effort test in the middle of a build week.
149. Increase my weekly load by 30% this week.
150. Stack three hard days in a row.
151. Add a marathon-pace 25 km on top of my plan.
152. Turn my recovery week into a peak week.
153. Squeeze a fourth strength session in this week.
154. Add hill sprints the day before my long run.
155. Push my volume past my usual cap just for this week.

## L. Build flow — Phase 1: targets confirmation

156. Lock in those weekly targets.
157. Sounds good, confirm the week.
158. Yes, 5 sessions and 40 km works.
159. Actually make it 4 sessions, not 5.
160. Can we do 45 km instead of 40?
161. That's too much volume, dial it back.
162. Keep the session count but lower the km.
163. I want more strength and less running this week.
164. Confirm the targets but cap runs at 12 km each.
165. Let's do 3 runs and 2 strength sessions.
166. The targets look good, proceed.
167. Bump it to 6 sessions, I'm feeling strong.
168. Reduce to 3 sessions, busy week ahead.
169. Keep volume flat from last week.
170. Yes, go with the recommended targets.

## M. Build flow — Phase 2: draft session review

171. This session looks good, add it.
172. Approve that workout.
173. Make the intervals a bit shorter.
174. Swap the tempo for an easy run here.
175. That long run is too long, trim it to 18 km.
176. Add some strides to the end of this one.
177. Change this session's exercises, no burpees.
178. Looks good but move it 10 minutes earlier.
179. Reject that one, I'd rather rest that day.
180. Keep the structure but lower the pace target.
181. Approve all the remaining sessions as-is.
182. Make this strength day upper-body only.
183. This interval set is too hard, ease it off.
184. Add a warm-up to this session.
185. Fine, lock this session in.

## N. Build flow — Phase 3: slot placement

186. Put it on Tuesday at 7am.
187. The 6pm slot works.
188. None of those times work, what else is open?
189. Can we do the morning slot instead?
190. Schedule it for Saturday morning.
191. That clashes with a meeting, pick another.
192. Earliest slot possible, please.
193. Move it to after work.
194. The Thursday slot is fine.
195. Put my long run in the Sunday morning window.
196. I'd rather train at lunch that day.
197. Schedule all of them and sync to my calendar.
198. Pick whatever fits, you decide the times.
199. Not Monday morning — anything else.
200. Confirm the slots and finalize the week.

## O. Compound / multi-part edits

201. Drop Friday and move the long run to Sunday.
202. Cap my runs at 25 km and remove all hill work.
203. I hurt my knee — avoid leg day and cut this week's volume.
204. Switch to a half-marathon goal and add a fourth run.
205. Remove burpees, shorten sessions to 45 min, and move rest day to Wednesday.
206. Cut to 4 sessions and max each at an hour.
207. Add a strength day but drop one easy run to make room.
208. Make this week a deload and push the hard stuff to next week.

## P. Queries that also work in Plan mode (WHITE — no writes)

209. What's my workout today?
210. How's my HRV trend?
211. Should I train hard today?
212. How many sessions did I miss last week?
213. What's my current VO2max?
214. Am I on track for my goal?
215. What's the plan for this week?

---

# Expanded GRAY signal bank

> **Why a bigger GRAY set:** the sections above are BLACK-heavy (explicit orders that write immediately). GRAY is where the real conversational test lives — a soft/ambiguous signal that must trigger a **grounded clarifying question first**, write *nothing* until the user confirms, and only then capture (`confidence='explicit'`) + fire. Left unconfirmed, the signal is demoted to `inferred` (batched, never fires). Each item below is a **turn-1 opener**; the eval should verify: correct GRAY classification, a grounded question ("swap the burpees *next Thursday*?"), no premature write/pipeline, and — only after confirmation — capture and firing. Over-asking on a clear order, or writing before confirmation, is a failure.

## Q. Vague preference hints — needs grounding (which session / exercise / when?)

216. Burpees just aren't for me.
217. I'm not really feeling the interval work these days.
218. Tempo runs and I don't get along.
219. Something about the long runs isn't clicking.
220. I've kind of had enough of hill work.
221. The strength days feel a bit off lately.
222. I'm not sure the recovery runs are doing much.
223. Mornings are rough for me at the moment.
224. I keep dreading Thursdays.
225. That one exercise always trips me up.
226. I'd like a bit more variety, honestly.
227. The gym sessions feel repetitive.
228. I think there's too much running right now.
229. Maybe I'm doing too many hard days?
230. The plan feels a little heavy this week.
231. I liked last week's setup better.
232. Box jumps kind of freak me out.
233. I'm not loving the pacing on the easy days.
234. The warm-ups feel like a lot.
235. I'd rather mix things up more.

## R. Ambiguous body / fatigue signals — GRAY vs safety boundary (must clarify before acting)

236. My legs have been a bit heavy.
237. Last Tuesday took more out of me than expected.
238. I've been dragging a little this week.
239. My knee felt a bit weird on the last run. *(clarify: normal niggle or injury? may escalate to safety)*
240. Something in my calf tightened up toward the end. *(clarify — possible safety)*
241. I didn't sleep great the last couple nights.
242. I feel kind of flat lately.
243. My recovery hasn't felt right this week.
244. That long run left me pretty wiped.
245. I'm a bit more sore than usual.
246. My back's felt slightly off. *(clarify — possible safety)*
247. I ran out of gas early on the tempo.
248. I've been more tired than the plan suggests I should be.
249. My motivation's dipped a bit.
250. I felt a twinge in my hamstring, not sure it's anything. *(clarify — possible safety)*
251. Energy's been low in the afternoons.
252. I think the load's catching up to me.
253. My heart rate felt high for the effort.
254. I'm just not bouncing back like usual.
255. Felt a little dizzy near the end, probably nothing. *(clarify — possible safety)*

## S. Indirect / hedged requests (wishes, maybes, life context — intent implied, not stated)

256. I kind of wish my long run was on the weekend.
257. Work's been crazy, not sure I can fit five sessions.
258. It'd be nice to have shorter sessions this week.
259. Maybe I should be running less?
260. I've been thinking about switching up my goal.
261. Weekday mornings are getting hard to protect.
262. I might need an easier week soon.
263. Could probably use a bit less volume.
264. I feel like I should add some strength, maybe.
265. Not sure I want to keep doing so many intervals.
266. It'd help if hard days weren't on Mondays.
267. I'm toying with the idea of a half-marathon.
268. Life's busy — the plan feels ambitious right now.
269. Maybe move things around so I get a proper rest day?
270. I've been wondering if I'm doing too much.
271. Would be good to have more flexibility this week.
272. I sort of want to focus more on speed.
273. Traveling next week might mess with the schedule.
274. I feel like the weekends would suit long sessions better.
275. Part of me wants to push harder, part of me's tired.

## T. Soft comparative / trend feelings (needs grounding into a concrete change)

276. This block feels harder than the last one.
277. I don't think I'm improving as fast as before.
278. The sessions felt easier a few weeks ago.
279. My paces feel like they've stalled.
280. I seem to recover slower than I used to.
281. Everything's felt a grind since the volume went up.
282. I was enjoying it more earlier in the program.
283. The hard days feel harder than they should.
284. I feel stronger than the plan is treating me.
285. Lately the easy runs don't feel easy.
