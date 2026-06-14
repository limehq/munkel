import MenuWindow from './components/MenuWindow';
import NotchWidget from './components/NotchWidget';
import PaletteWindow from './components/PaletteWindow';

const route = window.location.hash || '#/menu';

export default function App() {
	switch (route) {
		case '#/menu':
			return <MenuWindow />;
		case '#/notch':
			return <NotchWidget />;
		case '#/palette':
			return <PaletteWindow />;
		default:
			return <MenuWindow />;
	}
}
