import { analyseCsv, type AnalyseOptions, type ImportAnalysis, type SourceProfile } from "./engine";
import { STRONG_PROFILE } from "./strong";

/**
 * A CSV from an app this one has no profile for. It guesses columns from common spellings (the same
 * ones Strong's export uses) and reads a set's kind the same way, and the wizard's mapping step is
 * where a person fixes anything it guessed wrong or could not find.
 */
export const GENERIC_PROFILE: SourceProfile = {
  ...STRONG_PROFILE,
  id: "generic-csv",
  label: "a CSV file",
};

export function analyseGenericCsv(text: string, options: AnalyseOptions = {}): ImportAnalysis {
  return analyseCsv(text, GENERIC_PROFILE, options);
}
