import fs from 'fs';

let code = fs.readFileSync('components/TitleDetail.tsx', 'utf8');

const oldFuncRegex = /\s*async function handleDiarySubmit[\s\S]*?finally \{\r?\n\s*setDiarySaving\(false\);\r?\n\s*\}\r?\n\s*\}/;

const newFunc = `  async function handleLogDiary(rating: number, note: string, date: string) {
    if (!title) return;
    setDiarySaving(true);
    try {
      await updateLibrary(title, 'watched', rating);
      if (note.trim()) {
        await api(\`/reviews/\${title.id}\`, 'POST', {
          rating,
          body: note.trim(),
          spoiler: false,
        });
      }
      setShowDiaryPrompt(false);
      toast('Logged to your cinema diary.');
    } catch (err: any) {
      toast(err?.message || 'Failed to save diary entry.');
    } finally {
      setDiarySaving(false);
    }
  }`;

if (!oldFuncRegex.test(code)) {
  console.error('Could not find oldFuncRegex');
  process.exit(1);
}
code = code.replace(oldFuncRegex, newFunc);

const oldAsideBlock = /\{\(showDiaryPrompt \|\| entry\?\.status === 'watched'\)[\s\S]*?<CinemaJournalCapsule[\s\S]*?\/>/;

const newAsideBlock = `{/* Feature 1: Live Screening Runtime & Finish Clock */}
    <ScreeningScheduler runtime={title.runtime} titleName={title.title} />

    {/* Feature 2: Private Screening Diary & Notes */}
    <PrivateScreeningNotes
      titleId={id}
      titleName={title.title}
      initialRating={entry?.rating ?? 4}
      onLogDiary={handleLogDiary}
      saving={diarySaving}
    />

    {/* Feature 3: Physical Ticket Stub Launcher */}
    <button
      type="button"
      className="button glass small"
      onClick={() => setShowTicketStub(true)}
      style={{ marginTop: 14, width: '100%', gap: 6, fontSize: 11 }}
    >
      <Ticket size={13} className="mint" />
      <span>View Physical Ticket Stub</span>
    </button>

    {/* Feature 4: TMDB Similar Discoveries */}
    <SimilarDiscoveries titleId={id} />`;

if (!oldAsideBlock.test(code)) {
  console.error('Could not find oldAsideBlock');
  process.exit(1);
}
code = code.replace(oldAsideBlock, newAsideBlock);

fs.writeFileSync('components/TitleDetail.tsx', code, 'utf8');
console.log('Successfully updated TitleDetail.tsx');
