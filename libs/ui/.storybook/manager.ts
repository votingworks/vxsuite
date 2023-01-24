import * as storybookThemes from '@storybook/theming';
import { addons } from '@storybook/manager-api';
import { Addon_Config, API_Layout } from '@storybook/types';

const config: Addon_Config & Partial<API_Layout> = {
  panelPosition: 'right',
  theme: storybookThemes.create({
    base: 'light',
    brandTitle: 'VotingWorks',
    brandUrl: 'https://www.voting.works/voting-system',
    brandImage: '/votingworks-wordmark-black.svg',
    brandTarget: '_blank',
  }),
};

addons.setConfig(config);
