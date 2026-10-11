// AU-01: passwords on common-password lists are refused. The most common choices of 8+ characters
// from public breach corpora (and local variants); compared case-insensitively.
const COMMON = [
  '12345678', '123456789', '1234567890', '123123123', '11111111', '00000000', '12341234', '87654321',
  '11223344', '12344321', '1q2w3e4r', '1qaz2wsx', 'qwertyui', 'qwertyuiop', 'asdfghjk', 'zxcvbnm1',
  'password', 'password1', 'password12', 'password123', 'passw0rd', 'p@ssw0rd', 'p@ssword', 'iloveyou',
  'iloveyou1', 'sunshine', 'princess', 'football', 'baseball', 'starwars', 'superman', 'whatever',
  'trustno1', 'letmein1', 'welcome1', 'welcome123', 'abcd1234', 'abc12345', 'abcdefgh', 'aaaaaaaa',
  'qwerty123', 'qwerty12', 'admin123', 'administrator', 'computer', 'internet', 'michelle', 'jennifer',
  'samsung1', 'samsung123', 'football1', 'liverpool', 'arsenal1', 'chelsea1', 'manchester', 'barcelona',
  'jesus123', 'blessing', 'blessed1', 'godisgood', 'mynameis', 'changeme', 'default1', 'test1234',
  'jamiiair', 'jamii123', 'jamiiair1', 'tanzania', 'tanzania1', 'kenya123', 'nairobi1', 'darsalaam',
  'dar es salaam', 'karibu123', 'asante123', 'mungu123', 'nakupenda', 'simba123', 'yanga123', 'mpenzi123',
];

const SET = new Set(COMMON);

export function isCommonPassword(password: string): boolean {
  return SET.has(password.toLowerCase());
}
