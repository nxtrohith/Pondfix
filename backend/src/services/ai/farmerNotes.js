// Farmer field notes ("fish gulping at the surface"). Jev turns free text into a category, a distress probability and a severity score so the
// advisor can use the observation next to the sensor readings. A note never creates, resolves or changes an alert. Text is untrusted input:
// it is length-limited, stored as data and only ever passed to the models as quoted data.
import { z } from 'zod';
import { validationError } from '../../utils/errors.js';
import { choice, noul, score, choiceOf, noulOf, scoreOf } from './jevClient.js';

export const NOTE_CATEGORIES = Object.freeze({
  low_oxygen_signs: 'Fish gasping, gulping at the surface or crowding near inlets',
  disease_signs: 'Lesions, spots, lethargy, abnormal swimming or unusual deaths',
  feeding_change: 'Reduced appetite or changed feeding behaviour',
  water_appearance: 'Water colour, scum, smell or turbidity change',
  equipment_issue: 'Aerator, pump, sensor or power problem',
  routine_normal: 'Routine visit with nothing unusual',
  other: 'None of the other categories',
});
const noteInput = z.object({ text: z.string().trim().min(3).max(500) }).strict();

export async function addNote({ db, jev, now }, pond, body) {
  const r = noteInput.safeParse(body);
  if (!r.success) throw validationError('request validation failed', r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  const doc = { pondId: pond._id, text: r.data.text, category: 'unclassified', createdAt: now() };
  if (jev) {
    try {
      const { model, answers } = await jev.evaluate({
        state: { note: doc.text },
        questions: {
          category: choice('What is `note` mainly about?', NOTE_CATEGORIES),
          distress: noul('Does `note` describe stock in distress or an urgent problem in the pond?'),
          severity: score('How serious is what `note` describes?', ['Nothing wrong', 'Worth watching', 'Serious, needs prompt action']),
        },
      });
      const c = choiceOf(answers.category); const d = noulOf(answers.distress); const s = scoreOf(answers.severity);
      if (c && c.choice in NOTE_CATEGORIES) { doc.category = c.choice; doc.categoryConfidence = c.confidence; }
      if (d !== null) doc.distress = d;
      if (s) doc.severityScore = s.score;
      doc.classifiedBy = model;
    } catch { /* stored unclassified: the note is still useful to a human */ }
  }
  const { insertedId } = await db.collection('farmerNotes').insertOne(doc);
  return { id: insertedId, ...doc, pondId: pond._id };
}

export async function listNotes(db, pond, limit = 20) {
  const items = await db.collection('farmerNotes').find({ pondId: pond._id }).sort({ createdAt: -1, _id: -1 }).limit(Math.min(Math.max(limit, 1), 100)).toArray();
  return { items: items.map(({ _id, ...n }) => ({ id: _id, ...n })), count: items.length };
}
