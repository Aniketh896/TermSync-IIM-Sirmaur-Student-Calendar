// A filled-in config.gs for the tests: an invented first-year batch in Term 2,
// matching the made-up sheets in this folder. Nothing here is a real person.
var THIS_TERM = {
  name: "Term 2",
  batch: "Batch 26-28",
  calendarName: "IIM Sirmaur – Term 2",
  firstDay: "2026-09-14",
  lastDay:  "2027-01-10",
  courseSelection: "section",
  yearTags:       ["1STYEAR", "ISTYEAR"],
  ignoreYearTags: ["2NDYEAR", "IIYEAR"],
  termTags:       ["TERM-II", "TERMII", "T-II"],
  ignoreTermTags: ["TERM-III", "TERMIII", "T-III"],
  academicCalendarTerm: "Term II",
  examWindows: [
    { label: "Mid-term exams", start: "2026-10-26", end: "2026-10-30" },
    { label: "End-term exams", start: "2026-12-14", end: "2026-12-22" }
  ],
  termBreak:     { label: "Term break", start: "2026-12-23", end: "2027-01-03" },
  nextTermStart: "2027-01-04"
};

var PREVIOUS_TERM = { name: "", calendarName: "", firstDay: "", lastDay: "" };

var INSTITUTE = {
  name: "IIM Sirmaur",
  emailDomain: "iimsirmaur.ac.in",
  feedbackFormUrl: "https://olt.iimsirmaur.ac.in/",
  oltPortalUrl:    "https://olt.iimsirmaur.ac.in/",
  sacLinkedIn: "https://www.linkedin.com/company/saciimsirmaur",
  faviconUrl: ""
};

var MAINTAINER = { name: "Test Maintainer", roll: "MBA26901", linkedin: "https://www.linkedin.com/in/test-maintainer/" };

var DATA_SOURCES = {
  timetableSheet: "https://docs.google.com/spreadsheets/d/TESTMIRRORSHEETID0123456789abcdef/edit#gid=0",
  timetableTab:   "Timetable",
  quizSchedule:     "https://docs.google.com/spreadsheets/d/e/2PACX-TESTSCHEDULEDOC/pubhtml?gid=111&single=true",
  midTermSchedule:  "https://docs.google.com/spreadsheets/d/e/2PACX-TESTSCHEDULEDOC/pub?gid=222&single=true&output=csv",
  endTermSchedule:  "",
  academicCalendar: "",
  courseCatalogue:  "",
  marksStatus:      "",
  electivesSummary: "",
  subjectRepsSheet: "",
  guestLectures:    "",
  feedbackSchedule: "",
  timetablePublishedCsv: ""
};

var COURSES = {
  "ECO":  { name: "Economics for Managers",   area: "Economics",       credits: 3 },
  "FIN":  { name: "Finance Basics",           area: "Finance",         credits: 3 },
  "MKT":  { name: "Marketing Basics",         area: "Marketing",       credits: 3 },
  "OPS":  { name: "Operations",               area: "Operations",      credits: 3 },
  "STAT": { name: "Statistics",               area: "Decision Sciences", credits: 3 },
  "LEAD": { name: "Leadership Lecture Series", area: "General",        credits: 1 },
  "TOUR": { name: "Tourism Foundations",      area: "Tourism",         credits: 3, onlyFor: ["MBATM"] }
};

var STUDENTS = `
Roll No	Name	Section
MBA26901	TEST MAINTAINER	A
MBA26902	ASHA EXAMPLE	A
MBA26903	BIMAL  EXAMPLE	B
MBA26904	CHITRA EXAMPLE	C
MBA26905	DEV EXAMPLE	D
MBATM26901	ESHA EXAMPLE	B
MBA26906	FARAH EXAMPLE
`;

var SAC_TEAM = `
MBA26902, poc
MBA26904, member
`;

var SUBJECT_REPS = `
ECO, A, ASHA EXAMPLE, MBA26902
ECO, B, BIMAL EXAMPLE, MBA26903
LEAD, -, CHITRA EXAMPLE, MBA26904
`;

var COURSE_OUTLINES = {
  folder: "https://drive.google.com/drive/folders/TESTFOLDERID0123456789",
  files: {
    "ECO": [{ link: "https://drive.google.com/file/d/TESTFILEIDECO0123456789/view?usp=sharing", fac: "Prof. Example ECO" }],
    "FIN": [{ id: "TESTFILEIDFIN0123456789", fac: "" }]
  }
};

var COURSE_EVALUATION = {
  "ECO":  { total: 100, components: [
    { label: "Quizzes", weight: 20, kind: "quiz" },
    { label: "Mid-term exam", weight: 30, kind: "midterm" },
    { label: "End-term exam", weight: 50, kind: "endterm" } ] },
  "STAT": { total: 100, components: [
    { label: "Mid-term exam", weight: 40, kind: "midterm" },
    { label: "End-term exam", weight: 60, kind: "endterm" } ] }
};

var TEST_ONLY_FOR = [];

var SIT_IN_COURSES = {
};
