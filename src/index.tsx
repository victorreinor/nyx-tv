import { render } from 'solid-js/web';
import './ui/tokens.css';
import './ui/components.css';
import './ui/screens.css';
import { App } from './app/App';
import { installRemoteLog } from './app/log';

installRemoteLog();
render(() => <App />, document.getElementById('root')!);
// avisa o carregador que o script rodou até o fim (senão a versão baixada é abandonada na hora)
if (window.NyxBoot) window.NyxBoot.started();
