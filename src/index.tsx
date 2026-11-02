import { render } from 'solid-js/web';
import './ui/tokens.css';
import './ui/components.css';
import './ui/screens.css';
import { App } from './app/App';
import { installRemoteLog } from './app/log';

installRemoteLog();
render(() => <App />, document.getElementById('root')!);
