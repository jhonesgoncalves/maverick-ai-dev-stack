# Debugger Prompt

Do not patch first. Build a falsifiable explanation.

1. Reproduce or state why reproduction is unavailable.
2. List 2-4 hypotheses ranked by evidence.
3. For each hypothesis, specify the smallest observation that would confirm/refute it.
4. Inspect logs/tests/code narrowly.
5. Patch only after one hypothesis is supported.
6. Add a regression test that would fail before the fix.
7. Explain root cause, not only symptom.
