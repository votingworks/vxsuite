import {
  ElectionStringKey,
  LanguageCode,
  UiStringsPackage,
  YesNoContest,
} from '@votingworks/types';
import { election } from './election.json';

const ELECTION_GENERAL_CONTEST_TITLE_TRANSLATIONS_CHINESE = {
  '102': '措施 102：车辆减排计划',
  'city-council': '市议会',
  'city-mayor': '市长',
  'county-commissioners': '县专员',
  'county-registrar-of-wills': '遗嘱登记员',
  'judicial-elmer-hull': '保留埃尔默·赫尔担任副法官吗？',
  'judicial-robert-demergue':
    '保留罗伯特·德默格（Robert Demergue）担任首席大法官？',
  'lieutenant-governor': '副州长',
  'measure-101': '措施 101：大学区',
  'proposition-1': '提案 1：富兰克林县和弗洛维特县的赌博',
  'question-a': '问题A：财产损失的追偿',
  'question-b': '问题 B：权力分立',
  'question-c': '问题C：非经济损失的损害赔偿限额',
  'representative-district-6': '第 6 区代表',
  'secretary-of-state': '国务卿',
  'state-assembly-district-54': '第 54 区议会议员',
  'state-senator-district-31': '第 31 区参议员',
  governor: '州长',
  president: '主席和副主席',
  senator: '参议员',
} as const;

export const ELECTION_GENERAL_TEST_UI_STRINGS_CHINESE_SIMPLIFIED: UiStringsPackage =
  {
    [LanguageCode.CHINESE_SIMPLIFIED]: {
      [ElectionStringKey.COUNTY_NAME]: '富兰克林县',
      [ElectionStringKey.CONTEST_OPTION_LABEL]: Object.fromEntries(
        election.contests
          .filter(
            (contest): contest is YesNoContest => contest.type === 'yesno'
          )
          .flatMap((contest) => [contest.yesOption, contest.noOption])
          .map((option) => [option.id, option.id.endsWith('no') ? '不' : '是'])
      ),
      [ElectionStringKey.CONTEST_TITLE]:
        ELECTION_GENERAL_CONTEST_TITLE_TRANSLATIONS_CHINESE,
      [ElectionStringKey.ELECTION_TITLE]: '全民选举',
      [ElectionStringKey.PARTY_NAME]: {
        '0': '联邦党人',
        '1': '人们',
        '2': '自由',
        '3': '宪法',
        '4': '辉格党',
        '5': '劳动',
        '6': '独立的',
        '7': '民主党人',
        '8': '共和党人',
      },
      [ElectionStringKey.PRECINCT_NAME]: {
        '23': '斯普林菲尔德中心',
        '21': '北斯普林菲尔德',
        '20': '南斯普林菲尔德',
      },
      [ElectionStringKey.STATE_NAME]: '汉密尔顿州',
      noteBallotContestNoSelection: '无选择',
      labelNumVotesUnused: '未使用的票数：',
      labelWriteInParenthesized: '（写进）',
      titleBallotId: '选票识别',
      titleBallotStyle: '选票样式',
      titleOfficialBallot: '正式选票',
      titlePrecinct: '辖区',
      titleUnofficialTestBallot: '非官方测试选票',
    },
  };
