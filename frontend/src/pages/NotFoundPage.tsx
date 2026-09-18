import { Link } from 'react-router';
import { PagePlaceholder } from '../components/PagePlaceholder';

export function NotFoundPage() {
  return (
    <PagePlaceholder title="Page not found">
      <p>
        The page you requested does not exist. <Link to="/">Return to the home page</Link>.
      </p>
    </PagePlaceholder>
  );
}
