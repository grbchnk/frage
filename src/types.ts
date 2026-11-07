export interface PhotoPanel { path: string; trim_end?: number; replace_letters?: string; }
export interface Media { kind: string; path?: string; panels?: PhotoPanel[]; tokens?: string[]; joiner?: string; question_alt: string; question_masks_normalized?: number[][]; }
export interface Question { id: string; value: number; prompt: string; time_seconds: number; media: Media | null; }
export interface Category { id: number; title: string; description: string; questions: Question[]; }
export interface Pack { revision: string; categories: Category[]; rounds: {id: number; category_ids: number[]}[]; }
export interface Answer { answer: string; explanation: string; accepted_answers: string[]; host_note: string; }
export interface Player { id: string; name: string; score: number; }
export interface Game {
  phase: 'lobby'|'board'|'question'|'answer'|'break'|'finished';
  players: Player[]; turnIndex: number; roundIndex: number; completed: string[];
  activeQuestionId: string | null; revealed: Answer | null; winnerId: string | null;
  questionEndsAt: number | null; breakEndsAt: number | null; event: number;
  questionsPerCategory: number;
}
export interface Snapshot { id: string; state: Game; revision: number; }
