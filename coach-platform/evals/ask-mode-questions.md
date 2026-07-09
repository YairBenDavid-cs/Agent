# Ask Mode — Eval Questions (200+)

**Mode contract:** Read-only. The assistant answers facts, queries data, and may delegate to specialist verdicts (Recovery Guru, Coach). It must **never** write preferences or fire a pipeline. When the user expresses a *mutation intent* (BLACK/GRAY lane), Ask mode writes nothing, fires nothing, sets `intentBlocked: true`, and appends: *"(You're in Ask mode, so I haven't changed your plan. Switch to Plan mode and I'll make this change.)"* — even safety signals are blocked here.

**What we're evaluating per question:** correct lane classification, correct read-tool selection, no writes/no pipeline, accurate grounding in the user's actual data, and (for mutation attempts) correct intent-blocking + hint.

---

## A. Recovery & readiness facts (query_recovery)

1. What's my HRV today?
2. How's my HRV trending over the last week?
3. Is my HRV higher or lower than my 30-day baseline?
4. What was my resting heart rate this morning?
5. Has my resting HR been creeping up lately?
6. How many hours did I sleep last night?
7. What's my average sleep over the past week?
8. What's my training readiness score today?
9. Show me my readiness scores for the last 7 days.
10. What's my body battery right now?
11. Did my body battery fully recharge overnight?
12. What's my current ACWR?
13. Is my acute-to-chronic workload ratio in a safe range?
14. Which day this week did I recover best?
15. Which day this week was my worst recovery day?
16. Was my sleep quality good last night?
17. How's my stress trend this week?
18. Has my HRV dropped since my long run on Sunday?
19. What's my 7-day rolling average HRV?
20. Compare my recovery this week versus last week.
21. Did my readiness improve after the rest day?
22. What's my lowest HRV reading this month?
23. Are any of my recovery metrics flagging red today?
24. How does my resting HR compare to the start of the program?
25. Was there anything unusual in my overnight recovery data?

## B. Performance facts (query_performance)

26. What's my current VO2max?
27. Has my VO2max changed since I started the program?
28. What's my estimated 10K time right now?
29. What's my current race prediction for a half-marathon?
30. What's my lactate threshold pace?
31. Show me how my VO2max has trended over the last 8 weeks.
32. What's my current squat 1RM?
33. Has my bench press 1RM gone up this block?
34. What are my current estimated 1RMs for all main lifts?
35. What's my fastest 5K pace recorded this month?
36. How has my threshold pace changed since base phase?
37. What's my best long-run pace in the last month?
38. Show me my VO2max change log.
39. Am I faster now than 4 weeks ago?
40. What's my current deadlift estimate?
41. Which lift has improved the most this block?
42. What's my average pace across all easy runs this week?
43. Has my race prediction improved since my last hard workout?
44. What's my highest recorded body-weight-relative squat?
45. What's my aerobic threshold pace?

## C. Planned session & schedule facts (query_planned_sessions / get_week)

46. What's my workout today?
47. What's on the plan for tomorrow?
48. What's my long run this week?
49. When is my next hard session?
50. Show me the whole week's plan.
51. What sessions do I have left this week?
52. What's scheduled for Thursday?
53. How many sessions are planned this week?
54. What's the total planned volume for this week in km?
55. Is there a rest day coming up?
56. What intervals am I supposed to do on my next tempo run?
57. What's the structure of Saturday's long run?
58. Which exercises are in Monday's strength session?
59. How long is today's session supposed to take?
60. What's the target pace for today's easy run?
61. When's my next deload week?
62. What phase of the program am I in right now?
63. Which week of the program is this?
64. What's the hardest session on the plan this week?
65. Do I have any double sessions this week?
66. What's planned for the weekend?
67. How many strength sessions are in this week?
68. What's the prescribed load for Wednesday's squats?
69. Show me next week's plan if it's drafted.
70. What's the goal of this week's training block?

## D. Observed session facts (query_sessions)

71. What workout did I do yesterday?
72. Show me the run I did on June 15th.
73. What were my splits on my last long run?
74. What pace did I actually hit on Tuesday's tempo?
75. How far did I run last week in total?
76. What weight did I lift on squats last session?
77. Did I hit my prescribed intervals last workout?
78. What was my average heart rate on my last run?
79. How many total km did I run this month?
80. What was my longest run in the last 4 weeks?
81. Show me all the sessions I completed this week.
82. What was my heart rate zone breakdown on Sunday's run?
83. How much volume did I lift last strength session?
84. What was my fastest split on yesterday's intervals?
85. Did I go faster than prescribed on my easy run?
86. What was my total training time this week?
87. Show me my last five completed workouts.
88. How did my actual pace compare to target on my last tempo?
89. What was my elevation gain on Saturday's run?
90. How many reps did I complete on bench last time?

## E. Adherence facts (query_adherence)

91. How well did I stick to the plan this week?
92. How many sessions did I skip last week?
93. What's my adherence rate this month?
94. Which sessions did I miss in the last two weeks?
95. Have I completed every long run this block?
96. What's my current training streak?
97. Did I hit my weekly volume target last week?
98. How many planned sessions have I missed all program?
99. Which type of session do I skip most often?
100. Was I over or under my planned volume last week?
101. How consistent have I been with strength sessions?
102. Did I complete my full week last week?
103. How many rest days did I actually take versus planned?
104. What percentage of prescribed intervals did I complete this week?
105. Am I ahead or behind on total planned volume this block?

## F. Preference & profile facts (get_preference_events)

106. What preferences have you recorded for me?
107. Which exercises did I tell you to avoid?
108. What's my weekly km cap set to?
109. What session-length limit do I have set?
110. What did I tell you about my knee?
111. What run types do I prefer?
112. What's my current training goal on file?
113. What days am I available to train?
114. Remind me what I said about tempo runs.
115. What equipment do I have listed?
116. What's my target race date?
117. What experience level is on my profile?
118. Have I set any injury constraints?
119. What time windows do I prefer to train in?
120. What's my discipline set to — running or strength?

## G. Exercise catalog facts (search_exercise_catalog / get_exercise_detail)

121. What are some good alternatives to burpees?
122. Show me hamstring exercises I can do without equipment.
123. What muscles do Bulgarian split squats work?
124. Find me low-impact core exercises.
125. What's a good substitute for box jumps if my knee hurts?
126. Show me the full description of a Romanian deadlift.
127. What beginner-friendly shoulder exercises are in the catalog?
128. What's the difference between a front squat and a back squat?
129. List exercises that target the posterior chain.
130. What equipment do I need for a Turkish get-up?
131. Show me some plyometric drills for runners.
132. What are good mobility exercises for hips?
133. Find dumbbell-only upper body exercises.
134. What's a knee-friendly alternative to lunges?
135. Show me the exercise detail for a kettlebell swing.

## H. Calendar facts (list_calendar_events / get_availability)

136. What's on my calendar tomorrow morning?
137. Do I have any conflicts with Thursday's planned run?
138. What time windows am I usually free to train?
139. When's my next open slot for a long run?
140. Am I free Saturday morning?
141. What calendar events do I have this week during my usual training times?
142. Is my Wednesday evening blocked?
143. When did my last workout get scheduled on my calendar?
144. What's my recurring availability on file?
145. Do I have room for a 90-minute session this weekend?

## I. Cross-source / holistic facts (query_cross_source)

146. Give me a full picture of how my week has gone — training and recovery.
147. Is my fatigue matching my training load right now?
148. How does my recovery line up with my hard sessions this week?
149. Am I absorbing my training well based on recovery and performance?
150. Summarize my last two weeks: volume, adherence, and recovery.
151. Are my paces improving while my recovery stays stable?
152. What's the overall story of my training block so far?
153. Is there a mismatch between how hard I'm training and how I'm recovering?
154. Give me a state-of-the-union on my fitness.
155. How's my body responding to the build phase?

## J. Program-structure & goal facts

156. What's my overall program goal again?
157. How many weeks until my target race?
158. What's the structure of the whole 12-week program?
159. When does the peak phase start?
160. How many total weeks are in this program?
161. What's the purpose of the current block?
162. Am I in base, build, or peak right now?
163. When's my taper scheduled?
164. What was the plan supposed to look like by now?
165. How is this week different from last week in the periodization?

## K. Delegation / specialist verdict (WHITE lane, delegates to Recovery Guru / Coach)

166. Should I do hard intervals today?
167. Am I recovered enough to train right now?
168. Is today a good day to push hard?
169. Am I on track for my goal?
170. Should I take a rest day today?
171. Is my body ready for tomorrow's long run?
172. Given my recovery, should I dial it back this week?
173. Am I overtraining?
174. Is my current volume sustainable?
175. Should I be worried about my HRV drop?
176. Do you think I'll hit my race goal at this rate?
177. Is it safe to do a hard session on this readiness score?
178. Am I peaking at the right time?
179. Should I train through this fatigue or rest?
180. Is my progress fast enough to reach my target?
181. Would you recommend an easy day or a hard day today?
182. Am I doing too much strength work for a runner?
183. Is my sleep good enough to handle this training load?
184. Should I be concerned about my ACWR being high?
185. Based on everything, how am I really doing?

## L. Mutation intents that must be BLOCKED in Ask mode (test intent-blocking + hint)

186. Drop Friday's session.
187. Remove burpees from next week.
188. Cap my runs at 25 km.
189. Change my goal to a half-marathon.
190. I hurt my knee — take out leg day. *(safety signal — still blocked in Ask mode)*
191. Max my sessions at 45 minutes.
192. I hate tempo runs, get rid of them.
193. Move my long run to Sunday.
194. Add an extra strength session this week.
195. Reduce my volume this week, I'm exhausted.
196. Swap Thursday's intervals for an easy run.
197. I'm sick — cancel this week's hard sessions. *(safety — still blocked)*
198. Lower the intensity of tomorrow's workout.
199. Delete the Wednesday session.
200. Set my weekly cap to 4 sessions.
201. Reschedule everything to mornings.
202. I don't want to run more than 3 times a week anymore.
203. Take out the hill repeats, my calf is tight. *(safety — still blocked)*
204. Make next week a deload.
205. Replace all my long runs with cycling.

## M. Ambiguous / edge phrasing (does Ask mode read-only hold?)

206. My last run felt really hard — what does the data say?
207. I feel tired lately, is that showing up in my metrics?
208. I think I'm getting faster, am I right?
209. Something felt off on Tuesday's run — what happened?
210. I'm not sure I'm recovering well, can you check?
211. Do you think Friday's session is too much?
212. I've been sleeping badly — how bad is it?
213. Is it just me or is my pace stalling?
214. I might be overreaching, what do the numbers say?
215. Was that tempo run as slow as it felt?
