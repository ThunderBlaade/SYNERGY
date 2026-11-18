-- Photo storage for the Home feed. Safe to re-run.
-- Private bucket "media": signed-in friends can look at photos, you can only add or delete your own,
-- and the owner can delete any. Photos are shrunk on the phone to about 150 KB before upload.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', false, 400000, array['image/jpeg'])
on conflict (id) do update set file_size_limit = 400000, allowed_mime_types = array['image/jpeg'];

drop policy if exists media_read on storage.objects;
create policy media_read on storage.objects for select to authenticated
  using (bucket_id = 'media');

drop policy if exists media_add on storage.objects;
create policy media_add on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists media_del on storage.objects;
create policy media_del on storage.objects for delete to authenticated
  using (bucket_id = 'media' and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin()));
